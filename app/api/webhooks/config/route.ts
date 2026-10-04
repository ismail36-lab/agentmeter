import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAllowedWebhookUrl } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// In-memory fallback cache for webhooks if table is empty/missing
const memoryWebhooks: Record<string, any[]> = {};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

// ----------------------------------------------------------------------
// 1. GET HANDLER
// ----------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.warn("webhook_configs fetch notice:", error.message);
      const fallback = memoryWebhooks[user.id] || [];
      return NextResponse.json({ data: fallback }, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ data: data || [] }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

// ----------------------------------------------------------------------
// 2. POST HANDLER (With SSRF Protection & Crypto UUID)
// ----------------------------------------------------------------------
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
    const { url, type, name } = body;

    if (!url || !type || !name) {
      return NextResponse.json({ error: "Missing required fields: url, type, name" }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    // SSRF Protection Check
    if (!isAllowedWebhookUrl(url, type)) {
      return NextResponse.json(
        { error: `Target URL must be a valid HTTPS ${type === "discord" ? "Discord" : "Slack"} webhook URL.` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Secure Crypto UUID generation
    const newWebhookId = `wh_${crypto.randomUUID()}`;

    const { data, error } = await supabaseAdmin
      .from("webhook_configs")
      .insert({
        id: newWebhookId,
        user_id: user.id,
        url,
        type,
        name,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[webhooks/config] Create error:", error.message);
      return NextResponse.json({ error: "Failed to create webhook" }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ success: true, data }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error("[webhooks/config] Unexpected error during creation:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

// ----------------------------------------------------------------------
// 3. DELETE HANDLER (Fixes IDOR Vulnerability)
// ----------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Missing webhook id" }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    // IDOR Fix: eq("user_id", user.id)
    let deletedRow: { id: string } | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .from("webhook_configs")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.warn("webhook_configs delete notice:", error.message);
      } else {
        deletedRow = data;
      }
    } catch (err) {
      console.warn("webhook_configs delete exception:", err);
    }

    let deletedFromMemory = false;
    if (memoryWebhooks[user.id]) {
      const before = memoryWebhooks[user.id].length;
      memoryWebhooks[user.id] = memoryWebhooks[user.id].filter((w) => w.id !== id);
      deletedFromMemory = memoryWebhooks[user.id].length < before;
    }

    if (!deletedRow && !deletedFromMemory) {
      return NextResponse.json({ error: "Webhook not found or access denied" }, { status: 404, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ success: true, deleted: id }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}