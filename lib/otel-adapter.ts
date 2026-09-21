/**
 * OpenTelemetry (OTel) OTLP Trace Adapter
 * ----------------------------------------
 * Parses incoming standard OTLP JSON trace payloads (`resourceSpans` structure),
 * extracts GenAI/LLM span attributes (model name, prompt/completion/cached tokens,
 * latency, environment, agent, session_id), and standardizes events for Meterix log ingestion.
 */

export interface OTelValue {
  stringValue?: string;
  intValue?: number | string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OTelValue[] };
  kvlistValue?: any;
  bytesValue?: string;
  [key: string]: any;
}

export interface OTelAttribute {
  key: string;
  value?: OTelValue | any;
}

export interface OTelSpan {
  traceId?: string;
  spanId?: string;
  name?: string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: OTelAttribute[] | Record<string, any>;
  status?: { code?: number | string; message?: string };
}

export interface ScopeSpan {
  scope?: { name?: string; version?: string };
  spans?: OTelSpan[];
}

export interface ResourceSpan {
  resource?: { attributes?: OTelAttribute[] | Record<string, any> };
  scopeSpans?: ScopeSpan[];
}

export interface OTLPPayload {
  resourceSpans?: ResourceSpan[];
}

export interface MappedOtelSpan {
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  latency_ms: number;
  environment: string;
  agent_name: string;
  session_id: string | null;
  status_code: number;
  raw_attributes: Record<string, any>;
}

/**
 * Safely extracts primitive value from OTLP Attribute Value object or raw primitive
 */
export function getAttributeValue(val: any): any {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== "object") return val;
  if ("stringValue" in val) return val.stringValue;
  if ("intValue" in val) {
    const parsed = Number(val.intValue);
    return isNaN(parsed) ? val.intValue : parsed;
  }
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("boolValue" in val) return Boolean(val.boolValue);
  if ("arrayValue" in val) {
    const values = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return values.map((v: any) => getAttributeValue(v));
  }
  if ("value" in val) return getAttributeValue(val.value);
  return val;
}

/**
 * Converts array of OTLP attribute objects into a clean key-value dictionary
 */
export function parseAttributes(attributes: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!attributes) return result;

  try {
    if (Array.isArray(attributes)) {
      for (const attr of attributes) {
        if (attr && typeof attr === "object" && attr.key) {
          result[attr.key] = getAttributeValue(attr.value ?? attr);
        }
      }
    } else if (typeof attributes === "object") {
      for (const [key, val] of Object.entries(attributes)) {
        result[key] = getAttributeValue(val);
      }
    }
  } catch (err) {
    console.warn("[otel-adapter] Notice parsing attribute list:", err);
  }
  return result;
}

/**
 * Safely parses integer token counts from numeric values or strings
 */
export function parseTokenCount(val: any): number {
  if (val === null || val === undefined) return 0;
  const extracted = getAttributeValue(val);
  if (extracted === null || extracted === undefined) return 0;
  if (typeof extracted === "number") {
    return isNaN(extracted) || extracted < 0 ? 0 : Math.floor(extracted);
  }
  const parsed = parseInt(String(extracted).trim(), 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/**
 * Inspects parsed attributes to find the first matching value for a list of candidate keys
 */
function findFirstAttribute(attrs: Record<string, any>, candidateKeys: string[]): any {
  if (!attrs || typeof attrs !== "object") return undefined;
  for (const key of candidateKeys) {
    if (key in attrs && attrs[key] !== undefined && attrs[key] !== null) {
      return attrs[key];
    }
  }
  return undefined;
}

/**
 * Infers LLM provider from model name or explicit provider attribute
 */
export function inferProvider(modelName: string, explicitProvider?: string): string {
  if (explicitProvider && String(explicitProvider).trim()) {
    return String(explicitProvider).toLowerCase().trim();
  }
  const m = String(modelName || "").toLowerCase().trim();
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.includes("openai") || m.startsWith("text-embedding")) {
    return "openai";
  }
  if (m.startsWith("claude") || m.includes("anthropic")) {
    return "anthropic";
  }
  if (m.startsWith("gemini") || m.includes("google") || m.startsWith("palm")) {
    return "google";
  }
  if (m.startsWith("llama") || m.startsWith("mistral") || m.startsWith("deepseek") || m.startsWith("qwen")) {
    return "custom";
  }
  return "openai";
}

/**
 * Parses an OTLP JSON payload and extracts mapped GenAI / LLM spans.
 * Completely null-safe and wrapped in try/catch block.
 */
export function parseOtelSpans(payload: OTLPPayload | any): MappedOtelSpan[] {
  const mappedSpans: MappedOtelSpan[] = [];
  if (!payload || typeof payload !== "object") return mappedSpans;

  try {
    const resourceSpans: ResourceSpan[] = Array.isArray(payload.resourceSpans)
      ? payload.resourceSpans
      : [];

    for (const resSpan of resourceSpans) {
      if (!resSpan || typeof resSpan !== "object") continue;

      const resourceAttrs = parseAttributes(resSpan.resource?.attributes);
      const scopeSpans = Array.isArray(resSpan.scopeSpans) ? resSpan.scopeSpans : [];

      for (const scopeSpan of scopeSpans) {
        if (!scopeSpan || typeof scopeSpan !== "object") continue;

        const spans = Array.isArray(scopeSpan.spans) ? scopeSpan.spans : [];

        for (const span of spans) {
          if (!span || typeof span !== "object") continue;

          const spanAttrs = parseAttributes(span.attributes);
          const mergedAttrs = { ...resourceAttrs, ...spanAttrs };

          // Check model attribute keys with fallback to "unknown-model" if missing
          const modelNameRaw = findFirstAttribute(spanAttrs, [
            "gen_ai.request.model",
            "gen_ai.response.model",
            "llm.model",
            "model",
            "gen_ai.model",
            "request.model",
          ]) || findFirstAttribute(resourceAttrs, ["gen_ai.request.model", "llm.model", "model"]);

          const resolvedModel = (modelNameRaw && String(modelNameRaw).trim())
            ? String(modelNameRaw).trim()
            : "unknown-model";

          // Safely parse token counts
          const promptTokensVal = findFirstAttribute(spanAttrs, [
            "gen_ai.usage.prompt_tokens",
            "gen_ai.usage.input_tokens",
            "llm.usage.prompt_tokens",
            "llm.usage.input_tokens",
            "prompt_tokens",
            "input_tokens",
          ]);

          const completionTokensVal = findFirstAttribute(spanAttrs, [
            "gen_ai.usage.completion_tokens",
            "gen_ai.usage.output_tokens",
            "llm.usage.completion_tokens",
            "llm.usage.output_tokens",
            "completion_tokens",
            "output_tokens",
          ]);

          const totalTokensVal = findFirstAttribute(spanAttrs, [
            "gen_ai.usage.total_tokens",
            "llm.usage.total_tokens",
            "total_tokens",
          ]);

          const cachedTokensVal = findFirstAttribute(spanAttrs, [
            "gen_ai.usage.cached_tokens",
            "llm.usage.cached_tokens",
            "cached_tokens",
            "cache_read_tokens",
          ]);

          const pTokens = parseTokenCount(promptTokensVal);
          const cTokens = parseTokenCount(completionTokensVal);
          const rawTotal = parseTokenCount(totalTokensVal);
          const tTokens = Math.max(pTokens + cTokens, rawTotal);
          const cachedTokens = parseTokenCount(cachedTokensVal);

          // Determine if this span is an LLM / GenAI telemetry span
          const isGenAiSpan =
            Boolean(modelNameRaw) ||
            promptTokensVal !== undefined ||
            completionTokensVal !== undefined ||
            String(span.name || "").toLowerCase().includes("openai") ||
            String(span.name || "").toLowerCase().includes("llm") ||
            String(span.name || "").toLowerCase().includes("completion") ||
            String(span.name || "").toLowerCase().includes("chat");

          if (!isGenAiSpan) continue;

          // Calculate span latency in milliseconds from nanosecond timestamps
          let latencyMs = 0;
          if (span.startTimeUnixNano && span.endTimeUnixNano) {
            try {
              const startNano = BigInt(span.startTimeUnixNano);
              const endNano = BigInt(span.endTimeUnixNano);
              const diffNano = endNano - startNano;
              latencyMs = Math.max(0, Number(diffNano) / 1_000_000);
            } catch {
              const startNum = Number(span.startTimeUnixNano);
              const endNum = Number(span.endTimeUnixNano);
              if (!isNaN(startNum) && !isNaN(endNum)) {
                latencyMs = Math.max(0, (endNum - startNum) / 1_000_000);
              }
            }
          }

          // Environment, Agent Name, Session ID
          const env = String(
            findFirstAttribute(mergedAttrs, [
              "gen_ai.environment",
              "environment",
              "deployment.environment",
              "service.environment",
              "service.namespace",
            ]) || "production"
          ).toLowerCase();

          const agentName = String(
            findFirstAttribute(mergedAttrs, [
              "gen_ai.agent.name",
              "agent_name",
              "agent",
              "service.name",
            ]) || span.name || "default-agent"
          );

          const sessionId = String(
            findFirstAttribute(mergedAttrs, [
              "gen_ai.session.id",
              "session_id",
              "sessionId",
            ]) || ""
          ).trim() || null;

          const explicitProvider = findFirstAttribute(mergedAttrs, ["gen_ai.system", "provider", "llm.provider"]);
          const provider = inferProvider(resolvedModel, explicitProvider);

          let statusCode = 200;
          if (span.status?.code === "ERROR" || span.status?.code === 2 || span.status?.code === "2") {
            statusCode = 500;
          }

          mappedSpans.push({
            model: resolvedModel,
            provider,
            prompt_tokens: pTokens,
            completion_tokens: cTokens,
            total_tokens: tTokens,
            cached_tokens: cachedTokens,
            latency_ms: Math.round(latencyMs),
            environment: env,
            agent_name: agentName,
            session_id: sessionId,
            status_code: statusCode,
            raw_attributes: mergedAttrs,
          });
        }
      }
    }
  } catch (err: any) {
    console.error("[otel-adapter] Error parsing OTLP resourceSpans payload:", err);
  }

  return mappedSpans;
}
