/**
 * High-Performance Edge-Compatible Ingestion Route
 * POST /api/v1/ingest/edge
 *
 * - Runtime: Edge (Vercel/Cloudflare compatible)
 * - Auth: SHA-256 via Web Crypto API with fallback raw key matching
 * - DB: 2 roundtrips maximum (auth lookup + usage_logs insert)
 * - Pricing: Static embedded table for zero DB pricing lookups
 */

import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

// ── CORS Headers ─────────────────────────────────────────────────────────────

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, api-key, x-api-token",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

// ── Supabase Edge Client ──────────────────────────────────────────────────────

function getEdgeSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://placeholder.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Web Crypto API SHA-256 ──────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Static Model Pricing Table ────────────────────────────────────────────────

type PricingEntry = {
  provider: string;
  input: number;   // USD per token
  output: number;  // USD per token
};

const STATIC_PRICING: Record<string, PricingEntry> = {
  // OpenAI
  "gpt-4o":                     { provider: "openai", input: 2.5  / 1_000_000, output: 10.0  / 1_000_000 },
  "gpt-4o-mini":                { provider: "openai", input: 0.15 / 1_000_000, output: 0.60  / 1_000_000 },
  "gpt-4-turbo":                { provider: "openai", input: 10.0 / 1_000_000, output: 30.0  / 1_000_000 },
  "gpt-4":                      { provider: "openai", input: 30.0 / 1_000_000, output: 60.0  / 1_000_000 },
  "gpt-3.5-turbo":              { provider: "openai", input: 0.5  / 1_000_000, output: 1.5   / 1_000_000 },
  "o1":                         { provider: "openai", input: 15.0 / 1_000_000, output: 60.0  / 1_000_000 },
  "o1-mini":                    { provider: "openai", input: 3.0  / 1_000_000, output: 12.0  / 1_000_000 },
  "o3-mini":                    { provider: "openai", input: 1.1  / 1_000_000, output: 4.4   / 1_000_000 },
  // Anthropic
  "claude-opus-4-5":            { provider: "anthropic", input: 15.0 / 1_000_000, output: 75.0  / 1_000_000 },
  "claude-sonnet-4-5":          { provider: "anthropic", input: 3.0  / 1_000_000, output: 15.0  / 1_000_000 },
  "claude-haiku-3-5":           { provider: "anthropic", input: 0.8  / 1_000_000, output: 4.0   / 1_000_000 },
  "claude-3-opus":              { provider: "anthropic", input: 15.0 / 1_000_000, output: 75.0  / 1_000_000 },
  "claude-3-sonnet":            { provider: "anthropic", input: 3.0  / 1_000_000, output: 15.0  / 1_000_000 },
  "claude-3-haiku":             { provider: "anthropic", input: 0.25 / 1_000_000, output: 1.25  / 1_000_000 },
  // Google
  "gemini-2.0-flash":           { provider: "google", input: 0.1  / 1_000_000, output: 0.4   / 1_000_000 },
  "gemini-1.5-pro":             { provider: "google", input: 1.25 / 1_000_000, output: 5.0   / 1_000_000 },
  "gemini-1.5-flash":           { provider: "google", input: 0.075/ 1_000_000, output: 0.3   / 1_000_000 },
  // Meta / open-source
  "llama-3.1-405b-instruct":    { provider: "meta",  input: 3.0  / 1_000_000, output: 3.0   / 1_000_000 },
  "llama-3.1-70b-instruct":     { provider: "meta",  input: 0.88 / 1_000_000, output: 0.88  / 1_000_000 },
  "llama-3.1-8b-instruct":      { provider: "meta",  input: 0.18 / 1_000_000, output: 0.18  / 1_000_000 },
  // Mistral
  "mistral-large":              { provider: "mistral", input: 2.0  / 1_000_000, output: 6.0   / 1_000_000 },
  "mistral-small":              { provider: "mistral", input: 0.2  / 1_000_000, output: 0.6   / 1_000_000 },
  "mixtral-8x7b-instruct":      { provider: "mistral", input: 0.6  / 1_000_000, output: 0.6   / 1_000_000 },
  // Fallback (unknown models)
  "__default__":                { provider: "custom",  input: 1.0  / 1_000_000, output: 3.0   / 1_000_000 },
};

function lookupPricing(model: string): { pricing: PricingEntry; isEstimated: boolean } {
  const key = model.toLowerCase().trim();
  if (STATIC_PRICING[key]) return { pricing: STATIC_PRICING[key], isEstimated: false };

  let best: string | null = null;
  for (const tableKey of Object.keys(STATIC_PRICING)) {
    if (tableKey === "__default__") continue;
    if (key.startsWith(tableKey) || tableKey.startsWith(key)) {
      if (!best || tableKey.length > best.length) best = tableKey;
    }
  }
  if (best) return { pricing: STATIC_PRICING[best], isEstimated: false };

  return { pricing: STATIC_PRICING["__default__"], isEstimated: true };
}

// ── Request Body Schema ───────────────────────────────────────────────────────

interface IngestPayload {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms?: number;
  session_id?: string;
  metadata?: Record<string, unknown>;
  environment?: string;
  agent_name?: string;
  end_user_id?: string;
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // ── 1. Extract token from Authorization header or direct key headers ─────
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    let token = "";

    if (authHeader) {
      const bearerMatch = authHeader.match(/^bearer\s+(.+)$/i);
      if (bearerMatch && bearerMatch[1]) {
        token = bearerMatch[1];
      } else if (authHeader.trim().toLowerCase() !== "anonymous") {
        token = authHeader;
      }
    }

    if (!token) {
      const xApiKey =
        req.headers.get("x-api-key") ||
        req.headers.get("api-key") ||
        req.headers.get("x-api-token") ||
        "";
      if (xApiKey) {
        token = xApiKey;
      }
    }

    if (!token) {
      try {
        const url = new URL(req.url);
        const queryKey = url.searchParams.get("api_key") || url.searchParams.get("key");
        if (queryKey) {
          token = queryKey;
        }
      } catch {}
    }

    // Strip whitespace & leading/trailing quotes
    token = token.replace(/^["']|["']$/g, "").trim();

    console.log("[edge-auth] Extracted token:", token ? `${token.substring(0, 6)}... (len: ${token.length})` : "NONE");

    if (!token || token.includes("...")) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          extracted_token: token ? `${token.substring(0, 6)}...` : null,
          token_length: token ? token.length : 0,
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    // ── 2. Compute SHA-256 hash via Web Crypto API ────────────────────────────
    const keyHash = await sha256Hex(token);
    console.log("[edge-auth] Computed SHA-256 key_hash:", keyHash);

    // ── 3. DB Lookup: Check sha256(token) == key_hash OR raw token == key ─────
    const supabase = getEdgeSupabase();

    // Query by key_hash first
    let { data: keyRecord, error: keyError } = await supabase
      .from("api_keys")
      .select("id, user_id, project_id, key, key_hash, is_active, budget_cap_usd, current_period_spend_usd, budget_action")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    // Fallback: If not found by key_hash, check if raw key matches `key` column directly
    if (!keyRecord && !keyError) {
      const { data: rawMatchKey } = await supabase
        .from("api_keys")
        .select("id, user_id, project_id, key, key_hash, is_active, budget_cap_usd, current_period_spend_usd, budget_action")
        .eq("key", token)
        .eq("is_active", true)
        .maybeSingle();

      if (rawMatchKey) {
        keyRecord = rawMatchKey;
      }
    }

    console.log("[edge-auth] Key lookup result:", keyRecord ? `FOUND (id: ${keyRecord.id}, user: ${keyRecord.user_id})` : `NOT FOUND (error: ${keyError?.message ?? "none"})`);

    if (keyError || !keyRecord) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          extracted_token: token ? `${token.substring(0, 6)}...` : null,
          token_length: token ? token.length : 0,
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    // ── 4. Set user_id and project_id from matched key ───────────────────────
    const userId: string = String(keyRecord.user_id ?? "anonymous");
    const apiKeyId: string = String(keyRecord.id);
    const projectId: string | null = keyRecord.project_id ? String(keyRecord.project_id) : null;

    // ── 5. Parse + Validate Request Body ─────────────────────────────────────
    let body: IngestPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Bad Request: Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    const model = (body.model ?? "").toString().trim();
    if (!model) {
      return new Response(
        JSON.stringify({ error: "Bad Request: 'model' is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    const promptTokens = Math.max(0, Number(body.prompt_tokens) || 0);
    const completionTokens = Math.max(0, Number(body.completion_tokens) || 0);
    const latencyMs = Math.max(0, Number(body.latency_ms) || 0);
    const sessionId = body.session_id ? String(body.session_id) : null;
    const environment = body.environment
      ? String(body.environment)
      : body.metadata?.environment
        ? String(body.metadata.environment)
        : null;
    const agentName = body.agent_name
      ? String(body.agent_name)
      : body.metadata?.agent_name
        ? String(body.metadata.agent_name)
        : null;
    const endUserId = body.end_user_id ? String(body.end_user_id) : null;
    const metadata = body.metadata ?? null;

    // ── 6. Calculate Cost (static pricing — zero extra DB calls) ─────────────
    const { pricing, isEstimated } = lookupPricing(model);
    const totalCostUsd = Number(
      (promptTokens * pricing.input + completionTokens * pricing.output).toFixed(6)
    );

    // ── 7. Budget Guard ───────────────────────────────────────────────────────
    const budgetCap = keyRecord.budget_cap_usd != null ? Number(keyRecord.budget_cap_usd) : null;
    const currentSpend = Number(keyRecord.current_period_spend_usd ?? 0);
    if (budgetCap !== null && keyRecord.budget_action === "block" && currentSpend >= budgetCap) {
      return new Response(
        JSON.stringify({
          error: "Budget cap exceeded",
          budget_cap_usd: budgetCap,
          current_period_spend_usd: currentSpend,
        }),
        { status: 402, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    // ── 8. Insert into usage_logs with user_id, project_id, api_key_id ────────
    const nowIso = new Date().toISOString();
    const logPayload: Record<string, unknown> = {
      user_id: userId,
      api_key_id: apiKeyId,
      ...(projectId   && { project_id: projectId }),
      provider: pricing.provider,
      model,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_cost_usd: totalCostUsd,
      is_estimated: isEstimated,
      latency_ms: latencyMs,
      status_code: 200,
      timestamp: nowIso,
      created_at: nowIso,
      ...(sessionId   && { session_id: sessionId }),
      ...(environment && { environment }),
      ...(agentName   && { agent_name: agentName }),
      ...(endUserId   && { end_user_id: endUserId }),
      ...(metadata    && { metadata }),
    };

    const { data: insertedLog, error: insertError } = await supabase
      .from("usage_logs")
      .insert([logPayload])
      .select("id")
      .single();

    if (insertError) {
      console.error("[edge-ingest] Insert error:", insertError.message, insertError.details);
      return new Response(
        JSON.stringify({ error: `Database insert failed: ${insertError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors() } }
      );
    }

    // ── 9. Return 202 Accepted ────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        status: "ingested",
        log_id: insertedLog?.id ?? null,
        model,
        provider: pricing.provider,
        calculated_cost: totalCostUsd,
        is_estimated: isEstimated,
      }),
      { status: 202, headers: { "Content-Type": "application/json", ...cors() } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[edge-ingest] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors() } }
    );
  }
}
