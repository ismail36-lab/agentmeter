import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  // Reject requests attempting to access another user's tenant data
  const requestedUserId = req.nextUrl.searchParams.get("user_id") || req.nextUrl.searchParams.get("userId");
  if (requestedUserId && requestedUserId !== user.id) {
    return NextResponse.json(
      { error: "Forbidden: Cannot access data belonging to another tenant" },
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const cronSecret = process.env.CRON_SECRET;
    let customersData: any[] = [];

    // Internal fetch to stripe-sync with valid CRON_SECRET header
    if (cronSecret) {
      try {
        const origin = req.nextUrl.origin;
        const syncRes = await fetch(`${origin}/api/v1/cron/stripe-sync`, {
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        });

        if (syncRes.ok) {
          const syncJson = await syncRes.json();
          customersData = syncJson.customers || [];
        }
      } catch (err) {
        console.warn("[customer-profitability] internal stripe-sync fetch notice:", err);
      }
    }

    // Fallback DB query scoped strictly to the authenticated user.id
    if (customersData.length === 0) {
      const { data: dbRows } = await supabaseAdmin
        .from("customer_margins")
        .select("*")
        .eq("user_id", user.id)
        .order("margin", { ascending: true });

      customersData = dbRows || [];
    }

    // Ensure returned items belong exclusively to the authenticated user
    const scopedCustomers = customersData.filter((c: any) => c.user_id === user.id);

    return NextResponse.json(
      { success: true, customers: scopedCustomers },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("Customer Profitability GET Exception:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message || String(err) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
