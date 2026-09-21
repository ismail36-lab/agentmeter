import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyApiKey } from "@/lib/auth/meterix";
import { parseOtelSpans, MappedOtelSpan } from "@/lib/otel-adapter";
import { getCacheReadMultiplier } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Extract API Key from Authorization Bearer or x-api-key header ──
    const authHeader = req.headers.get("authorization");
    const xApiKey = req.headers.get("x-api-key");

    let apiKey = "";
    if (xApiKey && xApiKey.trim()) {
      apiKey = xApiKey.trim();
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else if (authHeader && authHeader !== "anonymous") {
      apiKey = authHeader.trim();
    }

    apiKey = apiKey.replace(/^["']|["']$/g, "").trim();

    if (!apiKey) {
      console.log("[otel-route] Authentication failed: Missing API Key in Authorization or x-api-key header");
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key in Authorization header or x-api-key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // ── 2. Authenticate API Key via SHA-256 hash lookup against api_keys table ──
    const authResult = await verifyApiKey(apiKey);
    if (!authResult.success || !authResult.apiKeyRecord) {
      console.log("[otel-route] Authentication failed:", authResult.error);
      return NextResponse.json(
        { error: authResult.error || "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // Set default user_id associated with the validated API key
    const keyRecord = authResult.apiKeyRecord;
    const userId = authResult.userId || keyRecord.user_id || "anonymous";

    // ── 3. Parse OTLP JSON Body safely ──
    const body = await req.json().catch((jsonErr) => {
      console.warn("[otel-route] Invalid or empty JSON body received:", jsonErr);
      return {};
    });

    let mappedSpans: MappedOtelSpan[] = [];
    try {
      mappedSpans = parseOtelSpans(body);
    } catch (parseErr: any) {
      console.error("[otel-route] Failed parsing OTLP resourceSpans payload:", parseErr);
      mappedSpans = [];
    }

    if (mappedSpans.length === 0) {
      // OTLP-compliant success response when no LLM spans matched in payload
      return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
    }

    // ── 4. Process and Ingest Mapped Spans into usage_logs ──
    const insertRows: Record<string, any>[] = [];

    for (const span of mappedSpans) {
      const modelKey = (span.model || "unknown-model").toLowerCase().trim();

      // Look up dynamic model pricing
      let inputRate = 1.0 / 1_000_000;
      let outputRate = 3.0 / 1_000_000;
      let isEstimated = true;
      let provider = span.provider || "custom";

      try {
        let { data: pricingRow } = await supabaseAdmin
          .from("model_pricing")
          .select("input_price_per_million, output_price_per_million, provider")
          .eq("model", modelKey)
          .eq("is_active", true)
          .maybeSingle();

        if (!pricingRow) {
          const { data: pricingByName } = await supabaseAdmin
            .from("model_pricing")
            .select("input_price_per_million, output_price_per_million, provider")
            .eq("model_name", modelKey)
            .eq("is_active", true)
            .maybeSingle();
          if (pricingByName) pricingRow = pricingByName;
        }

        if (pricingRow) {
          isEstimated = false;
          provider = pricingRow.provider || provider;
          inputRate = pricingRow.input_price_per_million / 1_000_000;
          outputRate = pricingRow.output_price_per_million / 1_000_000;
        }
      } catch (err) {
        console.warn("[otel-route] DB model_pricing lookup notice:", err);
      }

      const cacheReadMult = getCacheReadMultiplier(provider, modelKey);
      const cacheReadRate = inputRate * cacheReadMult;

      const safeCached = Math.max(0, span.cached_tokens || 0);
      const regularInput = Math.max(0, (span.prompt_tokens || 0) - safeCached);

      const calculatedCost =
        (regularInput * inputRate) +
        (safeCached * cacheReadRate) +
        ((span.completion_tokens || 0) * outputRate);

      const roundedCost = Number(calculatedCost.toFixed(6));

      insertRows.push({
        user_id: userId,
        model: span.model || "unknown-model",
        provider,
        input_tokens: Number(span.prompt_tokens || 0),
        output_tokens: Number(span.completion_tokens || 0),
        total_cost_usd: roundedCost,
        latency_ms: Number(span.latency_ms || 0),
        status_code: Number(span.status_code || 200),
        is_estimated: isEstimated,
        ...(span.session_id && { session_id: span.session_id }),
        ...(span.agent_name && { agent_name: span.agent_name }),
        ...(span.environment && { environment: span.environment }),
      });
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("usage_logs")
        .insert(insertRows);

      if (insertError) {
        console.error("[otel-route] Supabase insert error:", insertError.message, insertError.details);
        return NextResponse.json(
          { error: `Database insertion failed: ${insertError.message}` },
          { status: 500, headers: getCorsHeaders() }
        );
      }
    }

    // ── 5. Return OTLP-compliant success response ({}) with HTTP 200 ──
    return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || "Internal Server Error";
    console.error("[otel-route] 500 Internal Error during OTLP trace ingestion:", error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
