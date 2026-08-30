import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/** Generate a unique Meterix API key string with strictly unique secret strings & prefixes. */
function generateApiKey(env: "live" | "test" = "live"): string {
  const prefix = env === "test" ? "mx_test_" : "mx_live_";
  const randomHex = crypto.randomBytes(18).toString("hex");
  return `${prefix}${randomHex}`;
}

// GET /api/keys — list all keys for the authenticated user
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("api_keys GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] });
}

// POST /api/keys — create a new API key for the authenticated user
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name = "Default Key";
  let env: "live" | "test" = "live";
  try {
    const body = await req.json();
    if (body?.name) name = String(body.name).slice(0, 80);
    if (body?.environment === "test" || body?.is_test === true) env = "test";
  } catch {}

  // Enforce a soft cap of 10 keys per user
  const { count } = await supabaseAdmin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: "Key limit reached (10 active keys maximum)" }, { status: 400 });
  }

  const key = generateApiKey(env);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert([{ user_id: user.id, name, key, is_active: true, created_at: new Date().toISOString() }])
    .select("id, name, key, is_active, created_at")
    .single();

  if (error) {
    console.error("api_keys POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key: data }, { status: 201 });
}
