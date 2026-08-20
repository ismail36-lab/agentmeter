import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Pricing dictionary per 1,000,000 tokens (Rates in USD per single token)
const MODEL_PRICING: Record<
  string,
  { input_cost_per_token: number; output_cost_per_token: number; provider: string }
> = {
  // --- OpenAI Models ---
  "gpt-4o": {
    input_cost_per_token: 2.5 / 1_000_000,
    output_cost_per_token: 10.0 / 1_000_000,
    provider: "openai",
  },
  "gpt-4o-mini": {
    input_cost_per_token: 0.15 / 1_000_000,
    output_cost_per_token: 0.6 / 1_000_000,
    provider: "openai",
  },
  "o1": {
    input_cost_per_token: 15.0 / 1_000_000,
    output_cost_per_token: 60.0 / 1_000_000,
    provider: "openai",
  },
  "o1-preview": {
    input_cost_per_token: 15.0 / 1_000_000,
    output_cost_per_token: 60.0 / 1_000_000,
    provider: "openai",
  },
  "o1-mini": {
    input_cost_per_token: 3.0 / 1_000_000,
    output_cost_per_token: 12.0 / 1_000_000,
    provider: "openai",
  },

  // --- Anthropic Models ---
  "claude-3-5-sonnet": {
    input_cost_per_token: 3.0 / 1_000_000,
    output_cost_per_token: 15.0 / 1_000_000,
    provider: "anthropic",
  },
  "claude-3.5-sonnet": {
    input_cost_per_token: 3.0 / 1_000_000,
    output_cost_per_token: 15.0 / 1_000_000,
    provider: "anthropic",
  },
  "claude-3-haiku": {
    input_cost_per_token: 0.8 / 1_000_000,
    output_cost_per_token: 4.0 / 1_000_000,
    provider: "anthropic",
  },
  "claude-3.5-haiku": {
    input_cost_per_token: 0.8 / 1_000_000,
    output_cost_per_token: 4.0 / 1_000_000,
    provider: "anthropic",
  },
  "claude-3-opus": {
    input_cost_per_token: 15.0 / 1_000_000,
    output_cost_per_token: 75.0 / 1_000_000,
    provider: "anthropic",
  },

  // --- Gemini Models ---
  "gemini-1.5-pro": {
    input_cost_per_token: 1.25 / 1_000_000,
    output_cost_per_token: 5.0 / 1_000_000,
    provider: "gemini",
  },
  "gemini-1.5-flash": {
    input_cost_per_token: 0.075 / 1_000_000,
    output_cost_per_token: 0.3 / 1_000_000,
    provider: "gemini",
  },
  "gemini-2.0-flash": {
    input_cost_per_token: 0.10 / 1_000_000,
    output_cost_per_token: 0.4 / 1_000_000,
    provider: "gemini",
  },
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

    // 2. Fetch user_id and key record from `api_keys` table in Supabase
    let apiKeyRecord: { id?: string; name?: string; user_id?: string; is_active?: boolean } | null = null;
    let userId: string | null = null;
    let keyAuthFailed = false;

    try {
      const { data, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, name, user_id, is_active, key")
        .eq("key", apiKey)
        .maybeSingle();

      if (error) {
        console.warn("Supabase api_keys query notice:", error.message);
      }

      if (data) {
        if (data.is_active === false) {
          return NextResponse.json(
            { error: "Unauthorized: API Key is inactive" },
            { status: 401, headers: getCorsHeaders() }
          );
        }
        apiKeyRecord = data;
        userId = data.user_id ?? null;
      } else if (!error && apiKey.startsWith("am_test_")) {
        // Fallback for default test key
        apiKeyRecord = { id: "test_key_01", name: "Development Key", is_active: true };
      } else if (data === null) {
        keyAuthFailed = true;
      }
    } catch (err) {
      console.warn("API key verification notice:", err);
    }

    if (keyAuthFailed) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
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

    // 4. Cost calculation & is_estimated logic
    const modelKey = String(model).toLowerCase().trim();
    const pricing = MODEL_PRICING[modelKey];

    let roundedCost = 0;
    let isEstimated = false;
    let provider = body.provider || "custom";

    if (pricing) {
      provider = pricing.provider;
      const calculatedCost =
        pTokens * pricing.input_cost_per_token + cTokens * pricing.output_cost_per_token;
      roundedCost = Number(calculatedCost.toFixed(6));
      isEstimated = false;
    } else {
      // Unknown or custom model
      const explicitCost = body.cost ?? body.total_cost_usd ?? body.calculated_cost;
      if (explicitCost !== undefined && explicitCost !== null && !isNaN(Number(explicitCost))) {
        roundedCost = Number(Number(explicitCost).toFixed(6));
        isEstimated = false;
      } else {
        roundedCost = 0;
        isEstimated = true;
      }
    }

    const nowIso = new Date().toISOString();

    // 5. Construct log payload explicitly including user_id for DB schema
    const logPayload = {
      user_id: userId,
      provider: provider,
      model: modelKey,
      input_tokens: pTokens,
      output_tokens: cTokens,
      total_cost_usd: roundedCost,
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
        total_tokens: totalTokens,
        calculated_cost: roundedCost,
        is_estimated: isEstimated,
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
