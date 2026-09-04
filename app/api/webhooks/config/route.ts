import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// In-memory fallback cache for webhooks if table is initializing
const memoryWebhooks: Record<string, any[]> = {};

export async function GET(req: NextRequest) {
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
    const { data, error } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return NextResponse.json({ success: true, webhooks: data }, { headers: NO_CACHE_HEADERS });
    }

    // Fallback
    const userWebhooks = memoryWebhooks[user.id] || [];
    return NextResponse.json({ success: true, webhooks: userWebhooks }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.warn("webhook config GET exception:", err);
    return NextResponse.json({ success: true, webhooks: memoryWebhooks[user.id] || [] }, { headers: NO_CACHE_HEADERS });
  }
}

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
    const name = String(body.name || "Webhook Alert").trim();
    const url = String(body.url || "").trim();
    const type = body.type === "discord" ? "discord" : "slack";
    const triggers = Array.isArray(body.triggers) ? body.triggers : ["budget_alert", "budget_exceeded"];
    const isActive = body.is_active !== false;

    if (!url) {
      return NextResponse.json(
        { error: "Bad Request: Target Webhook URL is required" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();
    const newConfig = {
      id: "wh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      user_id: user.id,
      name,
      url,
      type,
      triggers,
      is_active: isActive,
      created_at: nowIso,
    };

    // DB Insert
    try {
      const { data, error } = await supabaseAdmin
        .from("webhook_configs")
        .insert([newConfig])
        .select()
        .single();

      if (!error && data) {
        return NextResponse.json({ success: true, webhook: data }, { status: 201, headers: NO_CACHE_HEADERS });
      }
    } catch (err) {
      console.warn("webhook_configs table insert notice:", err);
    }

    // Memory fallback update
    if (!memoryWebhooks[user.id]) memoryWebhooks[user.id] = [];
    memoryWebhooks[user.id].unshift(newConfig);

    return NextResponse.json({ success: true, webhook: newConfig }, { status: 201, headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error("webhook config POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing webhook id" }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    try {
      await supabaseAdmin.from("webhook_configs").delete().eq("id", id);
    } catch {}

    if (memoryWebhooks[user.id]) {
      memoryWebhooks[user.id] = memoryWebhooks[user.id].filter((w) => w.id !== id);
    }

    return NextResponse.json({ success: true, deleted: id }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
