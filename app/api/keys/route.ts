import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/** Generate a unique Meterix API key string formatted as mx_live_<random_32_chars> */
function generateFullApiKey(env: "live" | "test" = "live"): string {
  const prefix = env === "test" ? "mx_test_" : "mx_live_";
  const random32Hex = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  return `${prefix}${random32Hex}`;
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
    .select("id, name, key, key_hash, display_prefix, display_suffix, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("api_keys GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mappedKeys = (data ?? []).map((k: any) => {
    const rawKey = String(k.key || "");
    const prefix = k.display_prefix || (rawKey ? rawKey.slice(0, 12) : "mx_live_");
    const suffix = k.display_suffix || (rawKey ? rawKey.slice(-4) : "");
    const isLegacy = rawKey.startsWith("am_") || prefix.startsWith("am_") || !k.key_hash;

    return {
      id: k.id,
      name: k.name,
      display_prefix: prefix,
      display_suffix: suffix,
      is_active: k.is_active,
      created_at: k.created_at,
      is_legacy: isLegacy,
      key: isLegacy ? rawKey : `${prefix}...${suffix}`,
    };
  });

  return NextResponse.json({ keys: mappedKeys });
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

  const fullKey = generateFullApiKey(env);
  const key_hash = crypto.createHash("sha256").update(fullKey).digest("hex");
  const display_prefix = fullKey.slice(0, 12);
  const display_suffix = fullKey.slice(-4);
  const createdAt = new Date().toISOString();

  const insertPayload = {
    user_id: user.id,
    name,
    key_hash,
    display_prefix,
    display_suffix,
    key: `${display_prefix}...${display_suffix}`,
    is_active: true,
    created_at: createdAt,
  };

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert([insertPayload])
    .select("id, name, is_active, created_at")
    .single();

  if (error) {
    console.error("api_keys POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return fullKey ONLY ONCE in creation response payload
  return NextResponse.json(
    {
      key: {
        id: data.id,
        name: data.name,
        fullKey,
        key: fullKey,
        display_prefix,
        display_suffix,
        is_active: data.is_active,
        created_at: data.created_at,
        is_legacy: false,
      },
    },
    { status: 201 }
  );
}
