import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

    // 2. Compute SHA-256 hash of incoming raw token
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 3. Query Supabase api_keys table using supabaseAdmin for key_hash = tokenHash
    const { data: keyByHash } = await supabaseAdmin
      .from("api_keys")
      .select("*")
      .eq("key_hash", tokenHash)
      .maybeSingle();

    let keyRow = keyByHash;

    // 4. Fallback Authentication Path
    if (!keyRow) {
      const prefix = rawToken.substring(0, 10);
      const { data: keyByFallback } = await supabaseAdmin
        .from("api_keys")
        .select("*")
        .or(`key.eq.${rawToken},display_prefix.eq.${prefix}`)
        .maybeSingle();

      if (keyByFallback) {
        keyRow = keyByFallback;
      }
    }

    if (!keyRow) {
      console.error("[edge-auth-failure] Key lookup failed for prefix:", rawToken.substring(0, 8));
      return NextResponse.json(
        { error: "Unauthorized: Invalid API key" },
        { status: 401 }
      );
    }

    // 5. Extract user_id from authenticated key row
    const user_id = keyRow.user_id;

    // 6. Parse JSON request body and extract fields
    const body = await req.json().catch(() => ({}));

    const model = body.model || "unknown";
    const prompt_version_id = body.prompt_version_id ?? null;
    const input_tokens = body.input_tokens ?? body.prompt_tokens ?? 0;
    const output_tokens = body.output_tokens ?? body.completion_tokens ?? 0;
    const cost = body.cost ?? 0;

    // 7. Insert new record into usage_logs table
    const created_at = new Date().toISOString();

    const insertRecord: Record<string, any> = {
      user_id,
      model,
      prompt_version_id,
      input_tokens,
      output_tokens,
      cost,
      created_at,
    };

    let { error: insertError } = await supabaseAdmin
      .from("usage_logs")
      .insert(insertRecord);

    if (insertError) {
      // Fallback in case table column names vary in live Postgres schema
      const { error: fallbackError } = await supabaseAdmin
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
          { error: `Database insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // 8. Return HTTP 200 with success, user_id, prompt_version_id, logged: true
    return NextResponse.json(
      {
        success: true,
        user_id,
        prompt_version_id,
        logged: true,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[edge-ingest-error] Unhandled error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
