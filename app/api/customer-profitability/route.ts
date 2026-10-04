import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  calculateSingleCustomerMargin,
  type CustomerMarginItem,
} from "@/lib/customer-profitability";

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
    let customersData: CustomerMarginItem[] = [];

    // Calculate customer profitability strictly for the authenticated user context
    try {
      const singleMargin = await calculateSingleCustomerMargin(user.id, user.email);
      customersData = [singleMargin];
    } catch (calcErr) {
      console.warn("[customer-profitability] Single user calculation notice, falling back to DB query:", calcErr);
      const { data: dbRows } = await supabaseAdmin
        .from("customer_margins")
        .select("*")
        .eq("user_id", user.id)
        .order("margin", { ascending: true });

      customersData = (dbRows as CustomerMarginItem[]) || [];
    }

    // Ensure returned items belong exclusively to the authenticated user
    const scopedCustomers = customersData.filter((c: CustomerMarginItem) => c.user_id === user.id);

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
