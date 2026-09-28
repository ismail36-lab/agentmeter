import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  if (!cronSecret) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "CRON_SECRET environment variable missing on server" },
        { status: 500 }
      );
    }
  } else {
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      authHeader === cronSecret ||
      xCronSecret === cronSecret ||
      paramSecret === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase
      .from("api_keys")
      .update({ current_period_spend_usd: 0, budget_alert_sent: false })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select();

    if (error) {
      console.error("Supabase db error during reset:", error);
      return NextResponse.json(
        { success: false, db_error: error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Reset completed",
        updated: data,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("Cron reset error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
