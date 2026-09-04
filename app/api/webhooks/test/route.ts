import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { formatSlackBlockKitPayload, formatDiscordEmbedPayload } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    const body = await req.json();
    const url = String(body.url || "").trim();
    const type = body.type === "discord" ? "discord" : "slack";

    if (!url) {
      return NextResponse.json({ error: "Missing webhook URL" }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const testPayload = {
      event: "test_webhook" as const,
      apiKeyName: "Production Test Key",
      currentSpend: 84.5,
      budgetCap: 100.0,
      userId: user.id,
      message: "Test webhook alert dispatched successfully from Meterix Dashboard.",
    };

    const formattedPayload =
      type === "discord"
        ? formatDiscordEmbedPayload(testPayload)
        : formatSlackBlockKitPayload(testPayload);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formattedPayload),
    });

    if (res.ok) {
      return NextResponse.json(
        {
          success: true,
          status: res.status,
          message: `Test notification sent successfully to ${type.toUpperCase()} target!`,
        },
        { headers: NO_CACHE_HEADERS }
      );
    } else {
      const text = await res.text();
      return NextResponse.json(
        {
          success: false,
          status: res.status,
          error: `Target server returned status ${res.status}`,
          details: text,
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }
  } catch (err: any) {
    console.error("Test Webhook Error:", err);
    return NextResponse.json(
      { success: false, error: "Connection Failed", details: err.message || String(err) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
