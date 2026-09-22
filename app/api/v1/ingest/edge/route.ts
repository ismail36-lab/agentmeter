import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getDbClient() {
  try {
    if (supabaseAdmin) return supabaseAdmin;
  } catch {}

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://placeholder.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    // 1. Extract raw Bearer token from Authorization header
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!rawToken) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    // 2. Compute SHA-256 hash using native Web Crypto API
    const computedHash = await hashToken(rawToken);

    // 3. Query Supabase api_keys table using supabaseAdmin / db client
    const client = getDbClient();

    const { data: keyByHash } = await client
      .from("api_keys")
      .select("*")
      .eq("key_hash", computedHash)
      .maybeSingle();

    let keyRow = keyByHash;

    // 4. Fallback Authentication Path
    if (!keyRow) {
      const prefix = rawToken.substring(0, 10);
      const { data: keyByFallback } = await client
        .from("api_keys")
        .select("*")
        .or(`key.eq.${rawToken},display_prefix.eq.${prefix}`)
        .maybeSingle();

      if (keyByFallback) {
        keyRow = keyByFallback;
      }
    }

    const userId = keyRow?.user_id;

    if (!keyRow || !userId) {
      console.error("[edge-auth-failure] Key lookup failed for prefix:", rawToken.substring(0, 8));
      return NextResponse.json(
        { error: "Unauthorized: Invalid API key" },
        { status: 401 }
      );
    }

    // 5. Parse JSON request body
    const body = await req.json().catch(() => ({}));

    const model = body.model || "unknown";
    const prompt_version_id = body.prompt_version_id ?? null;
    const input_tokens = body.input_tokens ?? body.prompt_tokens ?? 0;
    const output_tokens = body.output_tokens ?? body.completion_tokens ?? 0;
    const cost = body.cost ?? 0;

    // 6. Insert new record into usage_logs table
    const created_at = new Date().toISOString();

    const insertRecord: Record<string, any> = {
      user_id: userId,
      model,
      prompt_version_id,
      input_tokens,
      output_tokens,
      cost,
      created_at,
    };

    let { error: insertError } = await client
      .from("usage_logs")
      .insert(insertRecord);

    if (insertError) {
      // Fallback: In case live Postgres schema uses total_cost_usd instead of cost
      const { error: fallbackError } = await client
        .from("usage_logs")
        .insert({
          ...insertRecord,
          total_cost_usd: cost,
        });

      if (fallbackError) {
        console.error(
          "[edge-ingest-error] Failed to insert usage log:",
          insertError.message,
          fallbackError.message
        );
        return NextResponse.json(
          { error: "Internal Server Error", details: `Database insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // 7. Return HTTP 200 with success, user_id, prompt_version_id, logged: true
    return NextResponse.json(
      {
        success: true,
        user_id: userId,
        prompt_version_id,
        logged: true,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[edge-ingest-error] Unhandled server error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
