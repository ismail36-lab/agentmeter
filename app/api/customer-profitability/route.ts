import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    // Forward to internal stripe sync route logic
    const origin = req.nextUrl.origin;
    const syncRes = await fetch(`${origin}/api/v1/cron/stripe-sync`, {
      headers: { "Cache-Control": "no-cache" },
      cache: "no-store",
    });

    if (syncRes.ok) {
      const data = await syncRes.json();
      return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
    }

    // Direct fallback lookup
    const { data: dbRows } = await supabaseAdmin
      .from("customer_margins")
      .select("*")
      .order("margin", { ascending: true });

    if (dbRows && dbRows.length > 0) {
      return NextResponse.json({ success: true, customers: dbRows }, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ success: true, customers: [] }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error("Customer Profitability GET Exception:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message || String(err) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
