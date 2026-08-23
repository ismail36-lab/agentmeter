import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Plan limits mirroring app/api/plan/route.ts
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
    // 1. Extract API key from x-api-key header or Authorization Bearer
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

    // 2. Validate API key against `api_keys` table (raw key lookup, same as key generation)
    //    This is how keys are stored: { user_id, name, key (raw string), is_active }
    const { data: keyRecord, error: keyError } = await supabaseAdmin
      .from("api_keys")
      .select("id, user_id, is_active, organization_id")
      .eq("key", apiKey)
      .maybeSingle();

    if (keyError) {
      console.warn("api_keys lookup error:", keyError.message);
    }

    if (!keyRecord) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    if (keyRecord.is_active === false) {
      return NextResponse.json(
        { error: "Unauthorized: API Key is inactive" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 3. Resolve org-level limits if organization_id is present on the key,
    //    otherwise fall back to user-level plan from `profiles`.
    let planType = "free";
    let monthlyLogLimit = PLAN_LIMITS.free;
    let scopeId: string | null = null; // used for usage_logs count scoping
    let scopeColumn: "organization_id" | "user_id" = "user_id";

    if (keyRecord.organization_id) {
      // Org-scoped key: fetch plan from organizations table
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("id, plan_type, monthly_log_limit")
        .eq("id", keyRecord.organization_id)
        .maybeSingle();

      if (org) {
        planType = org.plan_type || "free";
        monthlyLogLimit = org.monthly_log_limit ?? PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;
        scopeId = org.id;
        scopeColumn = "organization_id";
      }
    } else if (keyRecord.user_id) {
      // User-scoped key: fetch plan from profiles (Stripe/LemonSqueezy source of truth)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", keyRecord.user_id)
        .maybeSingle();

      if (profile?.plan) {
        planType = String(profile.plan).toLowerCase();
      } else {
        // Fallback to auth user_metadata
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(keyRecord.user_id);
          if (userData?.user?.user_metadata?.plan) {
            planType = String(userData.user.user_metadata.plan).toLowerCase();
          }
        } catch {}
      }

      monthlyLogLimit = PLAN_LIMITS[planType] ?? PLAN_LIMITS.free;
      scopeId = keyRecord.user_id;
      scopeColumn = "user_id";
    }

    if (!scopeId) {
      return NextResponse.json(
        { error: "Unauthorized: API Key has no associated user or organization" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 4. Count usage_logs for this scope since the 1st of the current month
    const now = new Date();
    const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { count } = await supabaseAdmin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq(scopeColumn, scopeId)
      .gte("created_at", firstDayOfMonth);

    const logCount = count ?? 0;

    // 5. Enforce monthly quota
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

    // 6. Parse body and build log payload
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

    // Attach the correct scope column
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
      console.error("Error inserting usage log:", insertError.message);
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
    console.error("Ingest API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
