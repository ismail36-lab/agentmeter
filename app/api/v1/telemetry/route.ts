import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  try {
    // 1. Extract API Key from headers
    const authHeader = req.headers.get("authorization");
    const xApiKey = req.headers.get("x-api-key");

    let apiKey = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
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

    // 2. Hash the raw token with SHA-256 and validate against `api_keys.key_hash` (with fallback for legacy keys)
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    let apiKeyRecord: {
      id?: string;
      name?: string;
      user_id?: string;
      is_active?: boolean;
      status?: string;
      budget_cap_usd?: number | null;
      current_period_spend_usd?: number | null;
      budget_action?: string | null;
    } | null = null;
    let userId: string | null = null;

    try {
      // Primary lookup: search by SHA-256 key_hash
      const { data: hashData, error: hashError } = await supabaseAdmin
        .from("api_keys")
        .select("id, name, user_id, is_active, status, budget_cap_usd, current_period_spend_usd, budget_action")
        .eq("key_hash", keyHash)
        .maybeSingle();

      let data = hashData;

      if (!data && !hashError) {
        // Secondary fallback lookup: search by raw key column for legacy am_ keys or unhashed keys
        const { data: legacyData, error: legacyError } = await supabaseAdmin
          .from("api_keys")
          .select("id, name, user_id, is_active, status, budget_cap_usd, current_period_spend_usd, budget_action")
          .eq("key", apiKey)
          .maybeSingle();

        if (legacyError) {
          console.warn("Supabase legacy key query notice:", legacyError.message);
        }
        data = legacyData;
      } else if (hashError) {
        console.warn("Supabase api_keys key_hash query notice:", hashError.message);
      }

      if (data) {
        const isActive = data.is_active !== false && data.status !== "inactive";
        if (isActive) {
          apiKeyRecord = data;
          userId = data.user_id ?? null;
        } else {
          return NextResponse.json(
            { error: "Unauthorized: API Key is inactive" },
            { status: 401, headers: getCorsHeaders() }
          );
        }
      } else {
        // Key not found in DB
        return NextResponse.json(
          { error: "Unauthorized: Invalid or inactive API Key" },
          { status: 401, headers: getCorsHeaders() }
        );
      }
    } catch (err) {
      console.warn("API key verification notice:", err);
      return NextResponse.json(
        { error: "Unauthorized: Key validation failed" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2b. Quota Limit Enforcement: Check public.profiles first (Stripe-driven plan),
    //     then fall back to user_metadata plan, then default to 'free'.
    let userPlan = "free";
    if (userId) {
      try {
        // Primary: read plan from public.profiles (updated by Stripe webhook)
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("plan")
          .eq("id", userId)
          .maybeSingle();

        if (profile?.plan) {
          userPlan = String(profile.plan).toLowerCase();
        } else {
          // Fallback: read plan from Supabase Auth user_metadata
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (userData?.user?.user_metadata?.plan) {
            userPlan = String(userData.user.user_metadata.plan).toLowerCase();
          }
        }
      } catch (err) {
        console.warn("Could not fetch plan for quota check:", err);
      }
    }

    // Query usage_logs table to count total logs for the current org/user
    let totalLogsCount = 0;
    try {
      let countQuery = supabaseAdmin
        .from("usage_logs")
        .select("id", { count: "exact", head: true });

      if (userId) {
        countQuery = countQuery.eq("user_id", userId);
      }

      const { count } = await countQuery;
      totalLogsCount = count ?? 0;
    } catch (err) {
      console.warn("Quota usage count notice:", err);
    }

    // Enforce limit for free-tier users (count >= 1000) before any token/cost calculation or DB insert
    if (totalLogsCount >= 1000 && userPlan === "free") {
      return NextResponse.json(
        { error: "Monthly log limit reached" },
        { status: 429, headers: getCorsHeaders() }
      );
    }

    // 3. Parse JSON Body
    const body = await req.json();
    const { model, prompt_tokens, completion_tokens, input_tokens, output_tokens, metadata } = body;

    const pTokens = Number(prompt_tokens ?? input_tokens ?? 0);
    const cTokens = Number(completion_tokens ?? output_tokens ?? 0);

    // Parse Prompt Caching fields
    const cachedTokens = Number(
      body.cached_tokens ??
      body.cache_read_tokens ??
      body.cache_read_input_tokens ??
      metadata?.cached_tokens ??
      metadata?.cache_read_tokens ??
      0
    );
    const cacheCreationTokens = Number(
      body.cache_creation_tokens ??
      body.cache_creation_input_tokens ??
      metadata?.cache_creation_tokens ??
      0
    );

    // Parse Metadata breakdown fields
    const envTag = String(
      metadata?.environment ?? body.environment ?? body.env ?? "production"
    ).toLowerCase();
    const agentTag = String(
      metadata?.agent_name ?? body.agent_name ?? body.agent ?? "default-agent"
    );
    const endUserTag = String(
      metadata?.user_id ?? body.end_user_id ?? body.client_id ?? userId ?? "anonymous"
    );

    if (!model || (prompt_tokens === undefined && input_tokens === undefined)) {
      return NextResponse.json(
        {
          error:
            "Bad Request: Required fields missing. Must provide 'model', 'prompt_tokens' (or 'input_tokens'), and 'completion_tokens' (or 'output_tokens').",
        },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const totalTokens = pTokens + cTokens;

    // 4. Dynamic pricing lookup from `model_pricing` DB table
    const modelKey = String(model).toLowerCase().trim();

    let roundedCost = 0;
    let cacheSavingsUSD = 0;
    let isEstimated = false;
    let warning: string | undefined;
    let provider = body.provider || "custom";

    // 4a. Query model_pricing for an active record
    let activePricing: ModelPricingRow | null = null;
    let fallbackPricing: ModelPricingRow | null = null;

    try {
      // First try: active record for this model
      let { data: activeRow } = await supabaseAdmin
        .from("model_pricing")
        .select("model, provider, input_price_per_million, output_price_per_million, is_active")
        .eq("model", modelKey)
        .eq("is_active", true)
        .maybeSingle();

      if (!activeRow) {
        const { data: activeRowByName } = await supabaseAdmin
          .from("model_pricing")
          .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
          .eq("model_name", modelKey)
          .eq("is_active", true)
          .maybeSingle();
        if (activeRowByName) {
          activeRow = {
            model: (activeRowByName as any).model_name,
            provider: activeRowByName.provider,
            input_price_per_million: activeRowByName.input_price_per_million,
            output_price_per_million: activeRowByName.output_price_per_million,
            is_active: activeRowByName.is_active,
          };
        }
      }

      if (activeRow) {
        activePricing = activeRow as ModelPricingRow;
      } else {
        // Fallback: any record for this model (inactive / last-known rate)
        let { data: fallbackRow } = await supabaseAdmin
          .from("model_pricing")
          .select("model, provider, input_price_per_million, output_price_per_million, is_active")
          .eq("model", modelKey)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!fallbackRow) {
          const { data: fallbackRowByName } = await supabaseAdmin
            .from("model_pricing")
            .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
            .eq("model_name", modelKey)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackRowByName) {
            fallbackRow = {
              model: (fallbackRowByName as any).model_name,
              provider: fallbackRowByName.provider,
              input_price_per_million: fallbackRowByName.input_price_per_million,
              output_price_per_million: fallbackRowByName.output_price_per_million,
              is_active: fallbackRowByName.is_active,
            };
          }
        }

        if (fallbackRow) {
          fallbackPricing = fallbackRow as ModelPricingRow;
        }
      }
    } catch (err) {
      console.warn("model_pricing DB lookup notice:", err);
    }

    if (activePricing) {
      // Active and valid model
      isEstimated = false;
      provider = activePricing.provider || provider;

      const inputRate = activePricing.input_price_per_million / 1_000_000;
      const outputRate = activePricing.output_price_per_million / 1_000_000;

      const cacheReadMultiplier = provider === "anthropic" ? 0.10 : 0.50;
      const cacheReadRate = inputRate * cacheReadMultiplier;
      const cacheWriteRate = inputRate * 1.25;

      const safeCached = Math.max(0, cachedTokens);
      const safeCreation = Math.max(0, cacheCreationTokens);
      const regularTokens = Math.max(0, pTokens - safeCached - safeCreation);

      const calculatedCost =
        (regularTokens * inputRate) +
        (safeCached * cacheReadRate) +
        (safeCreation * cacheWriteRate) +
        (cTokens * outputRate);

      roundedCost = Number(calculatedCost.toFixed(6));
      cacheSavingsUSD = Number((safeCached * (inputRate - cacheReadRate)).toFixed(6));
    } else if (fallbackPricing) {
      // Deprecated / inactive model (cost calculated using last-known rate)
      isEstimated = true;
      warning = "model deprecated or unrecognized, cost is an estimate";
      provider = fallbackPricing.provider || provider;

      const inputRate = fallbackPricing.input_price_per_million / 1_000_000;
      const outputRate = fallbackPricing.output_price_per_million / 1_000_000;

      const cacheReadMultiplier = provider === "anthropic" ? 0.10 : 0.50;
      const cacheReadRate = inputRate * cacheReadMultiplier;
      const cacheWriteRate = inputRate * 1.25;

      const safeCached = Math.max(0, cachedTokens);
      const safeCreation = Math.max(0, cacheCreationTokens);
      const regularTokens = Math.max(0, pTokens - safeCached - safeCreation);

      const calculatedCost =
        (regularTokens * inputRate) +
        (safeCached * cacheReadRate) +
        (safeCreation * cacheWriteRate) +
        (cTokens * outputRate);

      roundedCost = Number(calculatedCost.toFixed(6));
      cacheSavingsUSD = Number((safeCached * (inputRate - cacheReadRate)).toFixed(6));
    } else {
      // Unrecognized model (cost calculated using explicit cost or standard default fallback rate)
      isEstimated = true;
      warning = "model deprecated or unrecognized, cost is an estimate";

      const explicitCost = body.cost ?? body.total_cost_usd ?? body.calculated_cost;
      if (explicitCost !== undefined && explicitCost !== null && !isNaN(Number(explicitCost))) {
        roundedCost = Number(Number(explicitCost).toFixed(6));
      } else {
        const defaultInputCostPerToken = 1.0 / 1_000_000;
        const defaultOutputCostPerToken = 3.0 / 1_000_000;
        const calculatedCost = pTokens * defaultInputCostPerToken + cTokens * defaultOutputCostPerToken;
        roundedCost = Number(calculatedCost.toFixed(6));
      }
    }

    // 4b. Circuit Breaker Spend Check on api_keys
    let budgetWarning: string | undefined;

    if (apiKeyRecord?.id) {
      const budgetCap = apiKeyRecord.budget_cap_usd !== null && apiKeyRecord.budget_cap_usd !== undefined
        ? Number(apiKeyRecord.budget_cap_usd)
        : null;
      const currentSpend = Number(apiKeyRecord.current_period_spend_usd ?? 0);
      const action = String(apiKeyRecord.budget_action || "block_new_logs").toLowerCase();
      const newSpend = Number((currentSpend + roundedCost).toFixed(6));

      if (budgetCap !== null && budgetCap > 0 && newSpend > budgetCap) {
        if (action === "revoke_key") {
          // Suspend API key instantly
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
          // Update current_period_spend_usd normally
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
        // Within budget cap: update current_period_spend_usd
        await supabaseAdmin
          .from("api_keys")
          .update({ current_period_spend_usd: newSpend })
          .eq("id", apiKeyRecord.id);
      }
    }

    const nowIso = new Date().toISOString();

    // 5. Construct log payload — agent_name defaults to 'default-agent' if not supplied
    const logPayload = {
      user_id: userId,
      provider: provider,
      model: modelKey,
      input_tokens: pTokens,
      output_tokens: cTokens,
      cached_tokens: cachedTokens,
      cache_creation_tokens: cacheCreationTokens,
      environment: envTag,
      agent_name: agentTag || "default-agent",
      end_user_id: endUserTag,
      metadata: metadata || { environment: envTag, agent_name: agentTag || "default-agent" },
      total_cost_usd: roundedCost,
      is_estimated: isEstimated,
      latency_ms: Number(body.latency_ms || body.latency) || 100,
      status_code: 200,
      timestamp: nowIso,
      created_at: nowIso,
    };

    let logId = "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);

    try {
      // Insert into usage_logs table
      const { data: logData, error: logError } = await supabaseAdmin
        .from("usage_logs")
        .insert([logPayload])
        .select()
        .single();

      if (logError) {
        console.warn("Supabase usage_logs insert notice:", logError.message);
        // Fallback/secondary insert into telemetry_logs table
        try {
          const { data: tData } = await supabaseAdmin
            .from("telemetry_logs")
            .insert([
              {
                ...logPayload,
                cost: roundedCost,
                total_tokens: totalTokens,
                prompt_tokens: pTokens,
                completion_tokens: cTokens,
                is_estimated: isEstimated,
              },
            ])
            .select()
            .single();
          if (tData?.id) logId = tData.id;
        } catch {}
      } else if (logData && logData.id) {
        logId = logData.id;
      }
    } catch (err) {
      console.warn("Supabase log insert exception:", err);
    }

    // 6. Return response
    return NextResponse.json(
      {
        success: true,
        log_id: logId,
        model: modelKey,
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        cached_tokens: cachedTokens,
        cache_creation_tokens: cacheCreationTokens,
        total_tokens: totalTokens,
        calculated_cost: roundedCost,
        cache_savings_usd: cacheSavingsUSD,
        is_estimated: isEstimated,
        ...(warning && { warning }),
        ...(warning && { pricing_warning: warning }),
        ...(budgetWarning && { budget_warning: budgetWarning }),
        environment: envTag,
        agent_name: agentTag || "default-agent",
        currency: "USD",
        timestamp: nowIso,
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("Telemetry Ingestion Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
