import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { formatSlackBlockKitPayload, formatDiscordEmbedPayload, isAllowedWebhookUrl } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

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

    // SSRF Protection Check
    if (!isAllowedWebhookUrl(url, type)) {
      return NextResponse.json(
        { error: `Target URL must be a valid HTTPS ${type === "discord" ? "Discord" : "Slack"} webhook URL.` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const payload =
      type === "slack"
        ? formatSlackBlockKitPayload({
          event: "test_webhook",
          apiKeyName: "Test Key",
          currentSpend: 0,
          budgetCap: 100,
          message: "This is a test notification from Meterix.",
        })
        : formatDiscordEmbedPayload({
          event: "test_webhook",
          apiKeyName: "Test Key",
          currentSpend: 0,
          budgetCap: 100,
          message: "This is a test notification from Meterix.",
        });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Webhook endpoint returned status ${res.status}`, details: errText },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send test webhook" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}