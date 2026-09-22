export const runtime = "edge";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-idempotency-key, idempotency-key",
  };
}

function json(body: Record<string, any>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** SHA-256 hex hash via Web Crypto — Node's `crypto` module is NOT available on the edge runtime. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Infer provider from model name when the caller doesn't send one explicitly. */
function inferProvider(model: string): string {
  const m = (model || "").toLowerCase().trim();
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gemini") || m.startsWith("palm")) return "google";
  if (m.startsWith("llama") || m.startsWith("mistral") || m.startsWith("deepseek") || m.startsWith("qwen")) return "custom";
  return "openai";
}

export async function POST(req: Request) {
  // ── 1. Config ─────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  // IMPORTANT: no fallback to the anon key here anymore. usage_logs has RLS enabled
  // with an "insert TO authenticated" policy (see 20260920_enable_rls_policies.sql).
  // The anon key has role "anon", not "authenticated", so an insert made with it is
  // rejected by RLS outright — that silent fallback was a real, live bug.
  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set" }, 500);
  }

  // ── 2. Auth header ───────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!rawToken) {
    return json({ error: "Missing Authorization header (expected: Bearer mx_live_...)" }, 401);
  }

  let supabase;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err: any) {
    return json({ error: "Failed to initialize Supabase client", details: err?.message }, 500);
  }

  try {
    // ── 3. Verify key: hash lookup ONLY, and require is_active = true ───────
    // The old code also tried `.or(key.eq.<rawToken>, display_prefix.eq.<first10>)`
    // as a "fallback". Both halves are dead code:
    //  - `api_keys.key` only ever stores a MASKED string ("prefix...suffix"), never
    //    the real secret (see the key-generation route) — rawToken can never equal it.
    //  - `display_prefix` is 12 chars but the fallback compared it to the first 10
    //    chars of rawToken — different lengths never satisfy `eq`.
    // It also never checked `is_active`, so a revoked key still worked. All three
    // issues are fixed by this single, correct lookup.
    const keyHash = await sha256Hex(rawToken);

    const { data: keyRecord, error: keyErr } = await supabase
      .from("api_keys")
      .select("id, user_id, is_active")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (keyErr) {
      return json({ error: "Key verification failed", details: keyErr.message }, 500);
    }
    if (!keyRecord?.user_id) {
      return json({ error: "Unauthorized: invalid or revoked API key" }, 401);
    }

    // ── 4. Parse body defensively — every field has a safe fallback ─────────
    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      // Empty/invalid JSON body: keep defaults instead of hard-failing, some SDKs
      // send a bodyless ping.
    }

    const model = String(body.model || "unknown");

    let provider = String(body.provider || "").toLowerCase().trim();
    if (!provider) provider = inferProvider(model);

    const inputTokens = Number(body.input_tokens ?? body.prompt_tokens ?? 0) || 0;
    const outputTokens = Number(body.output_tokens ?? body.completion_tokens ?? 0) || 0;
    const cachedTokens = Number(body.cached_tokens ?? 0) || 0;
    const cacheCreationTokens = Number(body.cache_creation_tokens ?? 0) || 0;
    const latencyMs = Number(body.latency_ms ?? body.latency ?? 0) || 0;
    const statusCode = Number(body.status_code ?? 200) || 200;

    // Client-sent cost is NOT verified against server-side model pricing on this
    // route (that check lives in /api/v1/telemetry via lib/pricing.ts). Mark the row
    // "is_estimated" unless the caller didn't send a cost at all, so margin reports
    // downstream can tell real vs. self-reported numbers apart.
    const hasCost = body.total_cost_usd !== undefined || body.cost !== undefined;
    const cost = Number(body.total_cost_usd ?? body.cost ?? 0) || 0;
    const isEstimated = Boolean(body.is_estimated ?? !hasCost);

    const promptVersionId = body.prompt_version_id ? String(body.prompt_version_id) : null;
    const idempotencyKey =
      req.headers.get("x-idempotency-key") ||
      req.headers.get("idempotency-key") ||
      (body.idempotency_key ? String(body.idempotency_key) : null);

    const payload: Record<string, any> = {
      user_id: keyRecord.user_id,
      model,
      provider,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
      cache_creation_tokens: cacheCreationTokens,
      latency_ms: latencyMs,
      status_code: statusCode,
      total_cost_usd: cost, // single correct column name — no more 3-way guessing
      is_estimated: isEstimated,
      prompt_version_id: promptVersionId,
      created_at: new Date().toISOString(),
      ...(idempotencyKey && { idempotency_key: idempotencyKey }),
      ...(body.session_id && { session_id: String(body.session_id) }),
      ...(body.agent_name && { agent_name: String(body.agent_name) }),
      ...(body.environment && { environment: String(body.environment) }),
    };

    // ── 5. Idempotent replay check (cheap pre-check before insert) ──────────
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("usage_logs")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existing) {
        return json({ success: true, idempotent_replay: true, log_id: existing.id }, 200);
      }
    }

    // ── 6. Insert ─────────────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from("usage_logs")
      .insert([payload])
      .select("id")
      .single();

    if (insertErr) {
      // Race condition: two requests with the same idempotency_key inserted at
      // nearly the same time. Treat the loser as a successful replay, not an error.
      if (idempotencyKey) {
        const { data: existing } = await supabase
          .from("usage_logs")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existing) {
          return json({ success: true, idempotent_replay: true, log_id: existing.id }, 200);
        }
      }
      return json({ error: "Database insert failed", details: insertErr.message }, 500);
    }

    return json(
      { success: true, log_id: inserted?.id, user_id: keyRecord.user_id, is_estimated: isEstimated },
      200
    );
  } catch (err: any) {
    return json({ error: "Internal Edge Error", message: err?.message || String(err) }, 500);
  }
}