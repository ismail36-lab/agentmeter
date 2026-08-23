import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
    // 1. Extract x-api-key header (with Authorization Bearer fallback)
    const xApiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");

    let apiKey = "";
    if (xApiKey) {
      apiKey = xApiKey.trim();
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Query the `organizations` table for id, plan_type, and monthly_log_limit
    let org: { id: string; plan_type: string; monthly_log_limit: number } | null = null;

    const { data: orgData } = await supabaseAdmin
      .from("organizations")
      .select("id, plan_type, monthly_log_limit")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (orgData) {
      org = orgData;
    } else {
      // Fallback check against api_keys table to resolve organization_id
      const { data: keyData } = await supabaseAdmin
        .from("api_keys")
        .select("organization_id, user_id")
        .eq("key", apiKey)
        .maybeSingle();

      if (keyData?.organization_id) {
        const { data: orgFromKey } = await supabaseAdmin
          .from("organizations")
          .select("id, plan_type, monthly_log_limit")
          .eq("id", keyData.organization_id)
          .maybeSingle();
        if (orgFromKey) org = orgFromKey;
      } else if (keyData?.user_id) {
        const { data: orgFromUser } = await supabaseAdmin
          .from("organizations")
          .select("id, plan_type, monthly_log_limit")
          .or(`user_id.eq.${keyData.user_id},id.eq.${keyData.user_id}`)
          .maybeSingle();
        if (orgFromUser) org = orgFromUser;
      }
    }

    if (!org) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 3. Count logs in `usage_logs` for this organization_id created on/after the 1st of current month
    const now = new Date();
    const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { count } = await supabaseAdmin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("created_at", firstDayOfMonth);

    const logCount = count ?? 0;

    // 4. Rate-limiting check: return HTTP 429 if count >= monthly_log_limit
    if (logCount >= org.monthly_log_limit) {
      return NextResponse.json(
        {
          error: "Monthly quota exceeded",
          plan: org.plan_type,
          limit: org.monthly_log_limit,
        },
        { status: 429, headers: getCorsHeaders() }
      );
    }

    // 5. Parse request body and save incoming log
    const body = await req.json();
    const { model, prompt_tokens, completion_tokens, input_tokens, output_tokens, metadata, provider } = body;
    const pTokens = Number(prompt_tokens ?? input_tokens ?? 0);
    const cTokens = Number(completion_tokens ?? output_tokens ?? 0);
    const nowIso = new Date().toISOString();

    const logPayload = {
      organization_id: org.id,
      provider: provider || "custom",
      model: model ? String(model).toLowerCase().trim() : "unknown",
      input_tokens: pTokens,
      output_tokens: cTokens,
      total_cost_usd: Number(body.total_cost_usd || body.cost || 0),
      latency_ms: Number(body.latency_ms || body.latency) || 100,
      status_code: 200,
      timestamp: nowIso,
      created_at: nowIso,
    };

    const { data: savedLog, error: insertError } = await supabaseAdmin
      .from("usage_logs")
      .insert([logPayload])
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting usage log:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500, headers: getCorsHeaders() });
    }

    return NextResponse.json(
      {
        success: true,
        log_id: savedLog?.id || null,
        message: "Telemetry ingested successfully",
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("Ingest API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
