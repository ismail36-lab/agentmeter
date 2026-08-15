import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Pricing dictionary per 1,000,000 tokens (Rates in USD per single token)
const MODEL_PRICING: Record<
  string,
  { input_cost_per_token: number; output_cost_per_token: number }
> = {
  "gpt-4o": {
    input_cost_per_token: 2.5 / 1_000_000, // $2.50 per 1M prompt tokens
    output_cost_per_token: 10.0 / 1_000_000, // $10.00 per 1M completion tokens
  },
  "gpt-4o-mini": {
    input_cost_per_token: 0.15 / 1_000_000, // $0.15 per 1M prompt tokens
    output_cost_per_token: 0.6 / 1_000_000, // $0.60 per 1M completion tokens
  },
  "claude-3-5-sonnet": {
    input_cost_per_token: 3.0 / 1_000_000, // $3.00 per 1M prompt tokens
    output_cost_per_token: 15.0 / 1_000_000, // $15.00 per 1M completion tokens
  },
};

// Default pricing fallback for unrecognized models
const DEFAULT_PRICING = {
  input_cost_per_token: 2.0 / 1_000_000,
  output_cost_per_token: 8.0 / 1_000_000,
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

    // 4. Cost calculation logic
    const pricing = MODEL_PRICING[model.toLowerCase()] || DEFAULT_PRICING;
    const calculatedCost =
      pTokens * pricing.input_cost_per_token + cTokens * pricing.output_cost_per_token;
    const roundedCost = Number(calculatedCost.toFixed(6));

    const nowIso = new Date().toISOString();

    // 5. Construct log payload explicitly including user_id for DB schema
    const logPayload = {
      user_id: userId,
      provider: body.provider || "openai",
      model: model.toLowerCase(),
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
            .insert([{ ...logPayload, cost: roundedCost, total_tokens: totalTokens, prompt_tokens: pTokens, completion_tokens: cTokens }])
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
        model: model.toLowerCase(),
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        total_tokens: totalTokens,
        calculated_cost: roundedCost,
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
