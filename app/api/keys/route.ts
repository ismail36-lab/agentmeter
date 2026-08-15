import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Generate a unique AgentMeter API key string. */
function generateApiKey(userId: string): string {
  const prefix = userId.replace(/-/g, "").slice(0, 8);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `am_${prefix}_${random}`;
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
  try {
    const body = await req.json();
    if (body?.name) name = String(body.name).slice(0, 80);
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

  const key = generateApiKey(user.id);

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
