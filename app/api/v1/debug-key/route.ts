import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/debug-key?key=mx_live_xxx
 *
 * Diagnostic endpoint — reveals what Supabase returns for a given API key.
 * Gated behind CRON_SECRET to prevent unauthorized access in production.
 */
export async function GET(req: NextRequest) {
  // ── Auth gate: require CRON_SECRET ──────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "debug-key endpoint is disabled: CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

  if (!token || token !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized: valid CRON_SECRET required via Authorization: Bearer <secret>" },
      { status: 401 }
    );
  }

  // ── Original diagnostic logic ───────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") || "";

  if (!key) {
    return NextResponse.json({ error: "Provide ?key=<your_api_key>" }, { status: 400 });
  }

  // 1. Raw lookup
  const { data: keyRecord, error: keyError } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, is_active, organization_id, key")
    .eq("key", key)
    .maybeSingle();

  // 2. Table row count
  const { count: totalRows, error: countError } = await supabaseAdmin
    .from("api_keys")
    .select("id", { count: "exact", head: true });

  // 3. Sample up to 3 rows to inspect actual key format (masked for safety)
  const { data: sample } = await supabaseAdmin
    .from("api_keys")
    .select("id, key, is_active, user_id")
    .limit(3);

  return NextResponse.json({
    queried_key: key.slice(0, 12) + "..." + key.slice(-4),
    lookup_result: keyRecord
      ? {
          id: keyRecord.id,
          user_id: keyRecord.user_id,
          is_active: keyRecord.is_active,
          organization_id: keyRecord.organization_id,
          key_masked: keyRecord.key ? keyRecord.key.slice(0, 12) + "..." + keyRecord.key.slice(-4) : null,
        }
      : null,
    lookup_error: keyError ? { code: keyError.code, message: keyError.message } : null,
    table_total_rows: totalRows,
    table_count_error: countError?.message ?? null,
    sample_rows: sample?.map((r) => ({
      id: r.id,
      key_prefix: r.key ? r.key.slice(0, 12) + "…" : null,
      is_active: r.is_active,
      user_id: r.user_id,
    })),
  });
}
