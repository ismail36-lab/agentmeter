import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Plan limits
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
    // 1. Extract API key
    const xApiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");

    let apiKey = "";
    if (xApiKey) {
      apiKey = xApiKey.trim();
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    }

    console.log("[ingest] API key received:", apiKey ? `${apiKey.slice(0, 12)}…` : "(empty)");

    if (!apiKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Look up API key directly in api_keys table by raw key string
    //    (matching how keys are created: INSERT { key: rawString, user_id, is_active: true })
    const { data: keyRecord, error: keyError } = await supabaseAdmin
      .from("api_keys")
      .select("id, user_id, is_active, organization_id")
      .eq("key", apiKey)
      .maybeSingle();

    if (keyError) {
      console.error("[ingest] api_keys lookup error:", keyError.code, keyError.message, keyError.details);
    }

    console.log("[ingest] api_keys lookup result:", keyRecord ? `found id=${keyRecord.id}` : "null (not found)");

    if (!keyRecord) {
      // Diagnostic: check if the table is reachable at all and count total rows
      const { count: totalKeys, error: countErr } = await supabaseAdmin
        .from("api_keys")
        .select("id", { count: "exact", head: true });
      console.log("[ingest] api_keys total row count:", totalKeys, countErr?.message ?? "no error");

      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    if (keyRecord.is_active === false) {
      console.log("[ingest] Key is inactive:", keyRecord.id);
      return NextResponse.json(
        { error: "Unauthorized: API Key is inactive" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 3. Resolve plan and monthly limit
    let planType = "free";
    let monthlyLogLimit = PLAN_LIMITS.free;
    let scopeId: string | null = null;
    let scopeColumn: "organization_id" | "user_id" = "user_id";

    if (keyRecord.organization_id) {
      // Org-scoped key
      const { data: org, error: orgErr } = await supabaseAdmin
        .from("organizations")
        .select("id, plan_type, monthly_log_limit")
        .eq("id", keyRecord.organization_id)
        .maybeSingle();

      if (orgErr) console.error("[ingest] organizations lookup error:", orgErr.message);

      if (org) {
        planType = org.plan_type || "free";
        monthlyLogLimit = org.monthly_log_limit ?? PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;
        scopeId = org.id;
        scopeColumn = "organization_id";
      }
    }

    if (!scopeId && keyRecord.user_id) {
      // User-scoped key — resolve plan from profiles
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", keyRecord.user_id)
        .maybeSingle();

      if (profileErr) console.warn("[ingest] profiles lookup error:", profileErr.message);

      if (profile?.plan) {
        planType = String(profile.plan).toLowerCase();
      } else {
        // Fallback: auth user_metadata
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(keyRecord.user_id);
          if (userData?.user?.user_metadata?.plan) {
            planType = String(userData.user.user_metadata.plan).toLowerCase();
          }
        } catch (e) {
          console.warn("[ingest] getUserById fallback error:", e);
        }
      }

      monthlyLogLimit = PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;
      scopeId = keyRecord.user_id;
      scopeColumn = "user_id";
    }

    console.log("[ingest] Resolved scope:", scopeColumn, scopeId, "plan:", planType, "limit:", monthlyLogLimit);

    if (!scopeId) {
      return NextResponse.json(
        { error: "Unauthorized: API Key has no associated user or organization" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 4. Count usage_logs this month for quota enforcement
    const now = new Date();
    const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { count, error: countError } = await supabaseAdmin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq(scopeColumn, scopeId)
      .gte("created_at", firstDayOfMonth);

    if (countError) console.warn("[ingest] usage_logs count error:", countError.message);

    const logCount = count ?? 0;
    console.log("[ingest] Monthly usage count:", logCount, "/", monthlyLogLimit);

    // 5. Enforce monthly quota — return 429 if at or over limit
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

    // 6. Parse body and insert log
    const body = await req.json();
    const { model, prompt_tokens, completion_tokens, input_tokens, output_tokens, provider } = body;
    const pTokens = Number(prompt_tokens ?? input_tokens ?? 0);
    const cTokens = Number(completion_tokens ?? output_tokens ?? 0);
    const nowIso = new Date().toISOString();

    const logPayload: Record<string, unknown> = {
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

    if (scopeColumn === "organization_id") {
      logPayload.organization_id = scopeId;
    } else {
      logPayload.user_id = scopeId;
    }

    const { data: savedLog, error: insertError } = await supabaseAdmin
      .from("usage_logs")
      .insert([logPayload])
      .select()
      .single();

    if (insertError) {
      console.error("[ingest] usage_logs insert error:", insertError.message);
      return NextResponse.json(
        { error: "Failed to save log", details: insertError.message },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    return NextResponse.json(
      {
        success: true,
        log_id: savedLog?.id || null,
        message: "Telemetry ingested successfully",
        plan: planType,
        usage: logCount + 1,
        limit: monthlyLogLimit,
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("[ingest] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
