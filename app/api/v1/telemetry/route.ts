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

    // 2. Hash the raw token with SHA-256 and validate against `api_keys.key_hash` + `status = 'active'`
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    let apiKeyRecord: { id?: string; name?: string; user_id?: string; status?: string } | null = null;
    let userId: string | null = null;

    try {
      const { data, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, name, user_id, status")
        .eq("key_hash", keyHash)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        console.warn("Supabase api_keys query notice:", error.message);
      }

      if (data) {
        apiKeyRecord = data;
        userId = data.user_id ?? null;
      } else {
        // No matching active key found — reject immediately
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
    let pricingWarning: string | undefined;
    let provider = body.provider || "custom";

    // 4a. Query model_pricing for an active record
    let activePricing: ModelPricingRow | null = null;
    let fallbackPricing: ModelPricingRow | null = null;

    try {
      // First try: active record for this model
      const { data: activeRow } = await supabaseAdmin
        .from("model_pricing")
        .select("model, provider, input_price_per_million, output_price_per_million, is_active")
        .eq("model", modelKey)
        .eq("is_active", true)
        .maybeSingle();

      if (activeRow) {
        activePricing = activeRow as ModelPricingRow;
      } else {
        // Fallback: any record for this model (inactive / last-known rate)
        const { data: fallbackRow } = await supabaseAdmin
          .from("model_pricing")
          .select("model, provider, input_price_per_million, output_price_per_million, is_active")
          .eq("model", modelKey)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackRow) {
          fallbackPricing = fallbackRow as ModelPricingRow;
        }
      }
    } catch (err) {
      console.warn("model_pricing DB lookup notice:", err);
    }

    const pricing = activePricing ?? fallbackPricing;

    if (pricing) {
      provider = pricing.provider;

      // Mark as estimated when falling back to an inactive / last-known rate
      if (!activePricing && fallbackPricing) {
        isEstimated = true;
        pricingWarning = `Model "${modelKey}" is inactive or unrecognised — cost calculated using last-known rate.`;
      }

      // Convert per-million rates to per-token for arithmetic
      const inputCostPerToken = pricing.input_price_per_million / 1_000_000;
      const outputCostPerToken = pricing.output_price_per_million / 1_000_000;

      // Prompt Caching multiplier: 0.10x for Anthropic (90% off), 0.50x for OpenAI/Gemini (50% off)
      const cacheReadMultiplier = provider === "anthropic" ? 0.10 : 0.50;
      const validCachedTokens = Math.min(pTokens, Math.max(0, cachedTokens));
      const uncachedInputTokens = Math.max(0, pTokens - validCachedTokens);

      const uncachedInputCost = uncachedInputTokens * inputCostPerToken;
      const cacheReadCost = validCachedTokens * inputCostPerToken * cacheReadMultiplier;
      const cacheCreationCost = cacheCreationTokens * inputCostPerToken * 1.25;
      const outputCost = cTokens * outputCostPerToken;

      // Primary dynamic cost formula per spec:
      // (input_tokens / 1_000_000 * input_price_per_million) + (output_tokens / 1_000_000 * output_price_per_million)
      // Extended here to account for prompt-caching discounts and cache-write surcharge.
      const calculatedCost = uncachedInputCost + cacheReadCost + cacheCreationCost + outputCost;
      roundedCost = Number(calculatedCost.toFixed(6));

      // Calculate USD saved via prompt caching
      cacheSavingsUSD = Number(
        (validCachedTokens * inputCostPerToken * (1 - cacheReadMultiplier)).toFixed(6)
      );
    } else {
      // Completely unrecognised model — accept explicit cost or mark estimated
      isEstimated = true;
      pricingWarning = `Model "${modelKey}" not found in pricing table — cost could not be calculated.`;

      const explicitCost = body.cost ?? body.total_cost_usd ?? body.calculated_cost;
      if (explicitCost !== undefined && explicitCost !== null && !isNaN(Number(explicitCost))) {
        roundedCost = Number(Number(explicitCost).toFixed(6));
      } else {
        roundedCost = 0;
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
        ...(pricingWarning && { pricing_warning: pricingWarning }),
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
