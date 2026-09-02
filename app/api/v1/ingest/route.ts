import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Plan → monthly log limit (mirrors app/api/plan/route.ts)
const PLAN_LIMITS: Record<string, number> = {
  free: 1000,
  pro: 250000,
  enterprise: 1000000,
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
    // ── 1. Extract API key ────────────────────────────────────────────────
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

    // ── 2. Validate key against api_keys table ────────────────────────────
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    let userId: string | null = null;
    let keyValid = false;
    let keyInactive = false;

    try {
      // Primary lookup: SHA-256 key_hash
      const { data: hashData, error: hashError } = await supabaseAdmin
        .from("api_keys")
        .select("id, user_id, is_active")
        .eq("key_hash", keyHash)
        .maybeSingle();

      let data = hashData;

      if (!data && !hashError) {
        // Secondary fallback: raw key column
        const { data: legacyData } = await supabaseAdmin
          .from("api_keys")
          .select("id, user_id, is_active")
          .eq("key", apiKey)
          .maybeSingle();
        data = legacyData;
      }

      if (data) {
        if (data.is_active === false) {
          keyInactive = true;
        } else {
          keyValid = true;
          userId = data.user_id ?? null;
        }
      }
    } catch (err) {
      console.warn("[ingest] api_keys lookup exception:", err);
    }

    if (keyInactive) {
      return NextResponse.json(
        { error: "Unauthorized: API Key is inactive" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    if (!keyValid) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // ── 3. Resolve plan & monthly limit ───────────────────────────────────
    let planType = "free";

    if (userId) {
      try {
        // Primary: profiles table (Stripe / LemonSqueezy source of truth)
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("plan")
          .eq("id", userId)
          .maybeSingle();

        if (profile?.plan) {
          planType = String(profile.plan).toLowerCase();
        } else {
          // Fallback: auth user_metadata
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (userData?.user?.user_metadata?.plan) {
            planType = String(userData.user.user_metadata.plan).toLowerCase();
          }
        }
      } catch (err) {
        console.warn("[ingest] plan resolution warning:", err);
      }
    }

    const monthlyLogLimit = PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;

    // ── 4. Monthly quota check ────────────────────────────────────────────
    const now = new Date();
    const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    let logCount = 0;
    try {
      const countQuery = supabaseAdmin
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", firstDayOfMonth);

      const { count, error: countErr } = userId
        ? await countQuery.eq("user_id", userId)
        : await countQuery;

      if (countErr) {
        console.warn("[ingest] usage_logs count warning:", countErr.message);
      }
      logCount = count ?? 0;
    } catch (err) {
      console.warn("[ingest] usage_logs count exception:", err);
    }

    console.log(`[ingest] user=${userId} plan=${planType} usage=${logCount}/${monthlyLogLimit}`);

    // ── 5. Enforce quota → 429 ────────────────────────────────────────────
    if (logCount >= monthlyLogLimit) {
      return NextResponse.json(
        {
          error: "Monthly quota exceeded",
          plan: planType,
          limit: monthlyLogLimit,
        },
        { status: 429, headers: getCorsHeaders() }
      );
    }

    // ── 6. Parse body & insert log ────────────────────────────────────────
    const body = await req.json();
    const { model, prompt_tokens, completion_tokens, input_tokens, output_tokens, provider } = body;
    const pTokens = Number(prompt_tokens ?? input_tokens ?? 0);
    const cTokens = Number(completion_tokens ?? output_tokens ?? 0);
    const nowIso = new Date().toISOString();

    const logPayload: Record<string, unknown> = {
      user_id: userId,
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

    let logId: string | null = null;

    try {
      const { data: savedLog, error: insertError } = await supabaseAdmin
        .from("usage_logs")
        .insert([logPayload])
        .select()
        .single();

      if (insertError) {
        console.error("[ingest] usage_logs insert error:", insertError.message);
        // Fallback: try telemetry_logs table
        const { data: tLog } = await supabaseAdmin
          .from("telemetry_logs")
          .insert([{ ...logPayload, cost: logPayload.total_cost_usd, total_tokens: pTokens + cTokens }])
          .select()
          .single();
        if (tLog?.id) logId = tLog.id;
      } else {
        logId = savedLog?.id ?? null;
      }
    } catch (err) {
      console.warn("[ingest] log insert exception:", err);
    }

    return NextResponse.json(
      {
        success: true,
        log_id: logId,
        message: "Telemetry ingested successfully",
        plan: planType,
        usage: logCount + 1,
        limit: monthlyLogLimit,
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("[ingest] Unexpected top-level error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
