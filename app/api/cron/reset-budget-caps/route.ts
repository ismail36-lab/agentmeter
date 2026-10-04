import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return handleResetBudgetCaps(req);
}

export async function POST(req: NextRequest) {
  return handleResetBudgetCaps(req);
}

async function handleResetBudgetCaps(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed, unconditionally — no environment-based carve-out.
  // A missing secret must never be treated as "open" in any environment.
  if (!cronSecret) {
    console.error("[reset-budget-caps] CRON_SECRET is not configured — refusing to run.");
    return NextResponse.json(
      { error: "CRON_SECRET environment variable missing on server" },
      { status: 500 }
    );
  }

  // Header-only auth. Secrets never travel in the URL (logs/Referer leakage).
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .update({ current_period_spend_usd: 0, budget_alert_sent: false })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");

    if (error) {
      console.error("[reset-budget-caps] Supabase db error during reset:", error);
      return NextResponse.json(
        { success: false, db_error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Reset completed",
        updated_count: data?.length ?? 0,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    console.error("[reset-budget-caps] Cron reset error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
