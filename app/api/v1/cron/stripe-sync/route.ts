import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface CustomerMarginItem {
  user_id: string;
  email: string;
  stripe_customer_id: string | null;
  plan: string;
  revenue: number;
  total_cost: number;
  margin: number;
  margin_percentage: number;
  status: "unprofitable" | "low_margin" | "profitable";
  log_count: number;
  last_synced_at: string;
}

/** Helper to fetch revenue from Stripe REST API safely */
async function fetchStripeRevenueForCustomer(
  stripeCustomerId: string,
  stripeSecretKey: string
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/invoices?customer=${encodeURIComponent(stripeCustomerId)}&status=paid&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    );

    if (!res.ok) {
      console.warn(`Stripe API returned ${res.status} for customer ${stripeCustomerId}`);
      return 0;
    }

    const data = await res.json();
    const invoices = data?.data || [];
    const totalCents = invoices.reduce(
      (acc: number, inv: any) => acc + Number(inv.amount_paid || inv.total || 0),
      0
    );
    return Number((totalCents / 100).toFixed(2));
  } catch (err) {
    console.warn(`Error fetching Stripe revenue for ${stripeCustomerId}:`, err);
    return 0;
  }
}

export async function GET(req: NextRequest) {
  return handleStripeSync(req);
}

export async function POST(req: NextRequest) {
  return handleStripeSync(req);
}

async function handleStripeSync(req: NextRequest) {
  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

    // 1. Fetch user profiles from public.profiles
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, stripe_customer_id, plan");

    if (profileError) {
      console.warn("Stripe sync profile fetch notice:", profileError.message);
    }

    // 2. Fetch auth users if profiles table is empty/missing
    let usersList: { id: string; email: string; stripe_customer_id: string | null; plan: string }[] = [];

    if (profiles && profiles.length > 0) {
      usersList = profiles.map((p) => ({
        id: String(p.id),
        email: String(p.email || "user@example.com"),
        stripe_customer_id: p.stripe_customer_id ? String(p.stripe_customer_id) : null,
        plan: String(p.plan || "free").toLowerCase(),
      }));
    } else {
      try {
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsers?.users) {
          usersList = authUsers.users.map((u) => ({
            id: u.id,
            email: u.email || "user@example.com",
            stripe_customer_id: (u.user_metadata?.stripe_customer_id as string) || null,
            plan: String(u.user_metadata?.plan || "free").toLowerCase(),
          }));
        }
      } catch (err) {
        console.warn("Could not list auth users for stripe sync:", err);
      }
    }

    // 3. Query usage_logs to calculate total LLM cost and request count per user_id
    const { data: logs, error: logsError } = await supabaseAdmin
      .from("usage_logs")
      .select("user_id, total_cost_usd, cost");

    if (logsError) {
      console.warn("Stripe sync usage_logs fetch notice:", logsError.message);
    }

    const userCostMap: Record<string, { total_cost: number; log_count: number }> = {};

    (logs || []).forEach((log: any) => {
      const uid = String(log.user_id || "orphan");
      const cost = Number(log.total_cost_usd ?? log.cost ?? 0);

      if (!userCostMap[uid]) {
        userCostMap[uid] = { total_cost: 0, log_count: 0 };
      }
      userCostMap[uid].total_cost += isNaN(cost) ? 0 : cost;
      userCostMap[uid].log_count += 1;
    });

    // Ensure all users in usersList exist in userCostMap
    usersList.forEach((u) => {
      if (!userCostMap[u.id]) {
        userCostMap[u.id] = { total_cost: 0, log_count: 0 };
      }
    });

    // Also handle orphan logs if present
    if (userCostMap["orphan"] && !usersList.some((u) => u.id === "orphan")) {
      usersList.push({
        id: "orphan",
        email: "unassigned@telemetry.local",
        stripe_customer_id: null,
        plan: "free",
      });
    }

    const nowIso = new Date().toISOString();

    // 4. Compute revenue and margins for each customer
    const customerMargins: CustomerMarginItem[] = await Promise.all(
      usersList.map(async (u) => {
        let revenue = 0;

        if (u.stripe_customer_id && stripeSecretKey) {
          revenue = await fetchStripeRevenueForCustomer(u.stripe_customer_id, stripeSecretKey);
        }

        // Fallback revenue calculation if Stripe is not configured or returned 0
        if (revenue === 0) {
          if (u.plan === "pro") revenue = 99.0;
          else if (u.plan === "enterprise") revenue = 499.0;
          else revenue = 0.0;
        }

        const costData = userCostMap[u.id] || { total_cost: 0, log_count: 0 };
        const totalCost = Number(costData.total_cost.toFixed(4));
        const margin = Number((revenue - totalCost).toFixed(4));

        let marginPercentage = 0;
        if (revenue > 0) {
          marginPercentage = Number(((margin / revenue) * 100).toFixed(1));
        } else if (totalCost > 0) {
          marginPercentage = -100;
        }

        let status: "unprofitable" | "low_margin" | "profitable" = "profitable";
        if (margin < 0) {
          status = "unprofitable";
        } else if (marginPercentage < 30 || margin < 10) {
          status = "low_margin";
        }

        return {
          user_id: u.id,
          email: u.email,
          stripe_customer_id: u.stripe_customer_id,
          plan: u.plan,
          revenue,
          total_cost: totalCost,
          margin,
          margin_percentage: marginPercentage,
          status,
          log_count: costData.log_count,
          last_synced_at: nowIso,
        };
      })
    );

    // 5. Pre-sort by LOWEST MARGIN FIRST to highlight unprofitable or high-cost users
    customerMargins.sort((a, b) => a.margin - b.margin);

    // 6. Secondary persistence into customer_margins table if table exists
    try {
      await supabaseAdmin.from("customer_margins").upsert(
        customerMargins.map((c) => ({
          user_id: c.user_id,
          email: c.email,
          stripe_customer_id: c.stripe_customer_id,
          plan: c.plan,
          revenue: c.revenue,
          total_cost: c.total_cost,
          margin: c.margin,
          margin_percentage: c.margin_percentage,
          status: c.status,
          updated_at: nowIso,
        }))
      );
    } catch (err) {
      // Table may not exist yet; silent catch
    }

    return NextResponse.json(
      {
        success: true,
        total_customers: customerMargins.length,
        unprofitable_count: customerMargins.filter((c) => c.status === "unprofitable").length,
        synced_at: nowIso,
        customers: customerMargins,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("Stripe Sync Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
