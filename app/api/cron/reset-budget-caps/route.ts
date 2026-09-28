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
  const authHeader = req.headers.get("authorization");
  const xCronSecret = req.headers.get("x-cron-secret");
  const { searchParams } = new URL(req.url);
  const paramSecret = searchParams.get("secret") || searchParams.get("cron_secret");

  const isAuthorized =
    Boolean(cronSecret) &&
    (authHeader === `Bearer ${cronSecret}` ||
      xCronSecret === cronSecret ||
      paramSecret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .update({
        current_period_spend_usd: 0,
        budget_alert_sent: false,
      })
      .not("id", "is", null)
      .select("id");

    if (error) {
      console.error("[reset-budget-caps] Supabase update error:", error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const resetCount = data ? data.length : 0;

    return NextResponse.json(
      {
        success: true,
        keys_reset: resetCount,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[reset-budget-caps] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
