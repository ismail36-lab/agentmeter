import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 200;

/** Shape returned by the model_pricing table */
type ModelPricingRow = {
  model: string;
  provider: string;
  input_price_per_million: number;
  output_price_per_million: number;
  is_active: boolean;
};

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

// ── Auth helper: shared with single-event telemetry ──────────────────────────
async function resolveApiKey(
  apiKey: string
): Promise<{ userId: string | null; apiKeyRecord: any | null; error?: string }> {
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  // Primary: hash lookup
  const { data: hashData } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, is_active, status, budget_cap_usd, current_period_spend_usd, budget_action")
    .eq("key_hash", keyHash)
    .maybeSingle();

  let data = hashData;

  if (!data) {
    // Fallback: raw key (legacy am_ keys)
    const { data: legacyData } = await supabaseAdmin
      .from("api_keys")
      .select("id, user_id, is_active, status, budget_cap_usd, current_period_spend_usd, budget_action")
      .eq("key", apiKey)
      .maybeSingle();
    data = legacyData;
  }

  if (!data) return { userId: null, apiKeyRecord: null, error: "Unauthorized: Invalid or inactive API Key" };

  const isActive = data.is_active !== false && data.status !== "inactive";
  if (!isActive) return { userId: null, apiKeyRecord: null, error: "Unauthorized: API Key is inactive" };

  return { userId: data.user_id ?? null, apiKeyRecord: data };
}

// ── Quota helper ──────────────────────────────────────────────────────────────
async function getUserPlan(userId: string): Promise<string> {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.plan) return String(profile.plan).toLowerCase();

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userData?.user?.user_metadata?.plan) {
      return String(userData.user.user_metadata.plan).toLowerCase();
    }
  } catch {/* silent */}
  return "free";
}

async function getTotalLogCount(userId: string | null): Promise<number> {
  try {
    let q = supabaseAdmin.from("usage_logs").select("id", { count: "exact", head: true });
    if (userId) q = q.eq("user_id", userId);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Pricing lookup helper (mirrors single telemetry route) ────────────────────
async function resolveModelPricing(
  modelKey: string
): Promise<{ active: ModelPricingRow | null; fallback: ModelPricingRow | null }> {
  const normalize = (row: any): ModelPricingRow => ({
    model: row.model ?? row.model_name,
    provider: row.provider,
    input_price_per_million: row.input_price_per_million,
    output_price_per_million: row.output_price_per_million,
    is_active: row.is_active,
  });

  // Active lookup (by model column, then model_name column)
  let { data: activeRow } = await supabaseAdmin
    .from("model_pricing")
    .select("model, provider, input_price_per_million, output_price_per_million, is_active")
    .eq("model", modelKey)
    .eq("is_active", true)
    .maybeSingle();

  if (!activeRow) {
    const { data: r } = await supabaseAdmin
      .from("model_pricing")
      .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
      .eq("model_name", modelKey)
      .eq("is_active", true)
      .maybeSingle();
    if (r) activeRow = normalize(r) as any;
  }

  if (activeRow) return { active: normalize(activeRow), fallback: null };

  // Fallback: last-known / inactive
  let { data: fallbackRow } = await supabaseAdmin
    .from("model_pricing")
    .select("model, provider, input_price_per_million, output_price_per_million, is_active")
    .eq("model", modelKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fallbackRow) {
    const { data: r } = await supabaseAdmin
      .from("model_pricing")
      .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
      .eq("model_name", modelKey)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r) fallbackRow = normalize(r) as any;
  }

  return { active: null, fallback: fallbackRow ? normalize(fallbackRow) : null };
}

// ── Cost calculation helper ───────────────────────────────────────────────────
function computeCost(
  pricing: ModelPricingRow,
  pTokens: number,
  cTokens: number,
  cachedTokens: number,
  cacheCreationTokens: number
): { cost: number; cacheSavings: number } {
  const inputRate = pricing.input_price_per_million / 1_000_000;
  const outputRate = pricing.output_price_per_million / 1_000_000;
  const cacheReadMultiplier = pricing.provider === "anthropic" ? 0.10 : 0.50;
  const cacheReadRate = inputRate * cacheReadMultiplier;
  const cacheWriteRate = inputRate * 1.25;

  const safeCached = Math.max(0, cachedTokens);
  const safeCreation = Math.max(0, cacheCreationTokens);
  const regularTokens = Math.max(0, pTokens - safeCached - safeCreation);

  const cost = Number(
    (
      regularTokens * inputRate +
      safeCached * cacheReadRate +
      safeCreation * cacheWriteRate +
      cTokens * outputRate
    ).toFixed(6)
  );
  const cacheSavings = Number((safeCached * (inputRate - cacheReadRate)).toFixed(6));
  return { cost, cacheSavings };
}

// ── Single event processor ────────────────────────────────────────────────────
interface BatchEvent {
  model: string;
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cache_creation_tokens?: number;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
  cost?: number;
  total_cost_usd?: number;
  calculated_cost?: number;
  provider?: string;
}

interface EventResult {
  index: number;
  success: boolean;
  log_id?: string;
  model?: string;
  calculated_cost?: number;
  is_estimated?: boolean;
  warning?: string;
  error?: string;
}

async function processEvent(
  event: BatchEvent,
  index: number,
  userId: string | null
): Promise<EventResult> {
  try {
    const { model, metadata } = event;

    if (!model) return { index, success: false, error: "Missing required field: model" };

    const pTokens = Number(event.prompt_tokens ?? event.input_tokens ?? 0);
    const cTokens = Number(event.completion_tokens ?? event.output_tokens ?? 0);
    const cachedTokens = Number(event.cached_tokens ?? (metadata as any)?.cached_tokens ?? 0);
    const cacheCreationTokens = Number(event.cache_creation_tokens ?? 0);

    const modelKey = String(model).toLowerCase().trim();
    const envTag = String(
      (metadata as any)?.environment ?? "production"
    ).toLowerCase();
    const agentTag = String((metadata as any)?.agent_name ?? "default-agent");
    const endUserTag = String((metadata as any)?.user_id ?? userId ?? "anonymous");
    let provider = event.provider ?? "custom";

    const { active: activePricing, fallback: fallbackPricing } =
      await resolveModelPricing(modelKey);

    let roundedCost = 0;
    let isEstimated = false;
    let warning: string | undefined;

    if (activePricing) {
      provider = activePricing.provider || provider;
      const { cost } = computeCost(activePricing, pTokens, cTokens, cachedTokens, cacheCreationTokens);
      roundedCost = cost;
      isEstimated = false;
    } else if (fallbackPricing) {
      provider = fallbackPricing.provider || provider;
      isEstimated = true;
      warning = "model deprecated or unrecognized, cost is an estimate";
      const { cost } = computeCost(fallbackPricing, pTokens, cTokens, cachedTokens, cacheCreationTokens);
      roundedCost = cost;
    } else {
      isEstimated = true;
      warning = "model deprecated or unrecognized, cost is an estimate";
      const explicit = event.cost ?? event.total_cost_usd ?? event.calculated_cost;
      if (explicit !== undefined && explicit !== null && !isNaN(Number(explicit))) {
        roundedCost = Number(Number(explicit).toFixed(6));
      } else {
        roundedCost = Number((pTokens * (1.0 / 1_000_000) + cTokens * (3.0 / 1_000_000)).toFixed(6));
      }
    }

    const nowIso = new Date().toISOString();
    const logPayload = {
      user_id: userId,
      provider,
      model: modelKey,
      input_tokens: pTokens,
      output_tokens: cTokens,
      cached_tokens: cachedTokens,
      cache_creation_tokens: cacheCreationTokens,
      environment: envTag,
      agent_name: agentTag,
      end_user_id: endUserTag,
      metadata: metadata ?? { environment: envTag, agent_name: agentTag },
      total_cost_usd: roundedCost,
      is_estimated: isEstimated,
      latency_ms: Number(event.latency_ms ?? 0) || 0,
      status_code: 200,
      timestamp: nowIso,
      created_at: nowIso,
    };

    let logId = "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);

    const { data: logData, error: logError } = await supabaseAdmin
      .from("usage_logs")
      .insert([logPayload])
      .select()
      .single();

    if (logError) {
      // Fallback: telemetry_logs
      try {
        const { data: tData } = await supabaseAdmin
          .from("telemetry_logs")
          .insert([{ ...logPayload, cost: roundedCost, total_tokens: pTokens + cTokens, prompt_tokens: pTokens, completion_tokens: cTokens }])
          .select()
          .single();
        if (tData?.id) logId = tData.id;
      } catch {/* silent */}
    } else if (logData?.id) {
      logId = logData.id;
    }

    return {
      index,
      success: true,
      log_id: logId,
      model: modelKey,
      calculated_cost: roundedCost,
      is_estimated: isEstimated,
      ...(warning && { warning }),
    };
  } catch (err: any) {
    return { index, success: false, error: err?.message ?? "Unexpected error processing event" };
  }
}

// ── POST /api/v1/telemetry/batch ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Extract API key
    const authHeader = req.headers.get("authorization");
    const xApiKey = req.headers.get("x-api-key");

    let apiKey = "";
    if (authHeader?.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else if (xApiKey) {
      apiKey = xApiKey.trim();
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key in Authorization header or x-api-key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Validate API key once for the entire batch
    const { userId, apiKeyRecord, error: authError } = await resolveApiKey(apiKey);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401, headers: getCorsHeaders() });
    }

    // 3. Quota enforcement (batch counts against total logs)
    if (userId) {
      const [plan, totalLogs] = await Promise.all([
        getUserPlan(userId),
        getTotalLogCount(userId),
      ]);
      if (totalLogs >= 1000 && plan === "free") {
        return NextResponse.json(
          { error: "Monthly log limit reached" },
          { status: 429, headers: getCorsHeaders() }
        );
      }
    }

    // 4. Parse and validate body
    const body = await req.json();
    const events: BatchEvent[] = body?.events;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "Bad Request: 'events' must be a non-empty array" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (events.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Bad Request: Batch size exceeds maximum of ${MAX_BATCH_SIZE} events` },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // 5. Process all events in parallel — partial failures don't abort the batch
    const results: EventResult[] = await Promise.all(
      events.map((event, index) => processEvent(event, index, userId))
    );

    const processed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalBatchSpend = results.reduce((acc, r) => acc + (r.calculated_cost ?? 0), 0);

    // 5b. Circuit Breaker Spend Check on api_keys for batch
    let budgetWarning: string | undefined;

    if (apiKeyRecord?.id) {
      const budgetCap = apiKeyRecord.budget_cap_usd !== null && apiKeyRecord.budget_cap_usd !== undefined
        ? Number(apiKeyRecord.budget_cap_usd)
        : null;
      const currentSpend = Number(apiKeyRecord.current_period_spend_usd ?? 0);
      const action = String(apiKeyRecord.budget_action || "block_new_logs").toLowerCase();
      const newSpend = Number((currentSpend + totalBatchSpend).toFixed(6));

      if (budgetCap !== null && budgetCap > 0 && newSpend > budgetCap) {
        if (action === "revoke_key") {
          await supabaseAdmin
            .from("api_keys")
            .update({ is_active: false, status: "suspended" })
            .eq("id", apiKeyRecord.id);

          return NextResponse.json(
            { error: "Budget cap exceeded: API key has been suspended", action: "revoke_key" },
            { status: 403, headers: getCorsHeaders() }
          );
        } else if (action === "alert_only") {
          budgetWarning = "Budget cap exceeded for this API key";
          await supabaseAdmin
            .from("api_keys")
            .update({ current_period_spend_usd: newSpend })
            .eq("id", apiKeyRecord.id);
        } else {
          // Default: 'block_new_logs'
          return NextResponse.json(
            { error: "Budget cap exceeded", action: "block_new_logs" },
            { status: 402, headers: getCorsHeaders() }
          );
        }
      } else {
        await supabaseAdmin
          .from("api_keys")
          .update({ current_period_spend_usd: newSpend })
          .eq("id", apiKeyRecord.id);
      }
    }

    // 6. Return partial-success response
    return NextResponse.json(
      {
        success: true,
        processed,
        failed,
        total: events.length,
        ...(budgetWarning && { budget_warning: budgetWarning }),
        results,
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("Batch Telemetry Ingestion Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message ?? String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
