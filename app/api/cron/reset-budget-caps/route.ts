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
  try {
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

    const { data, error: updateError } = await supabase
      .from("api_keys")
      .update({
        current_period_spend_usd: 0,
        budget_alert_sent: false,
      })
      .not("id", "is", null)
      .select("id");

    if (updateError) {
      console.error("Cron reset error:", updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    const keysReset = data ? data.length : 0;

    return NextResponse.json(
      {
        success: true,
        keys_reset: keysReset,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: any) {
    console.error("Cron reset error:", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
