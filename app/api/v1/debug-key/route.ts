import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/debug-key?key=am_xxx
 *
 * TEMPORARY diagnostic endpoint — reveals what Supabase returns for a given API key.
 * Remove or gate behind CRON_SECRET before going to production.
 */
export async function GET(req: NextRequest) {
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

  // 3. Sample up to 3 rows to inspect actual key format
  const { data: sample } = await supabaseAdmin
    .from("api_keys")
    .select("id, key, is_active, user_id")
    .limit(3);

  return NextResponse.json({
    queried_key: key,
    key_prefix: key.slice(0, 15) + "…",
    lookup_result: keyRecord,
    lookup_error: keyError ? { code: keyError.code, message: keyError.message } : null,
    table_total_rows: totalRows,
    table_count_error: countError?.message ?? null,
    sample_rows: sample?.map((r) => ({
      id: r.id,
      key_prefix: r.key ? r.key.slice(0, 15) + "…" : null,
      is_active: r.is_active,
      user_id: r.user_id,
    })),
  });
}
