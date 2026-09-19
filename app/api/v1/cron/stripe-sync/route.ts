import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type RevenueSource = "lemonsqueezy_active" | "plan_estimate" | "free";

export interface CustomerMarginItem {
  user_id: string;
  email: string;
  lemon_squeezy_customer_id: string | null;
  lemon_squeezy_subscription_id: string | null;
  plan: string;
  subscription_status: string | null;
  revenue: number;
  revenue_source: RevenueSource;
  is_revenue_estimated: boolean;
  total_cost: number;
  margin: number;
  margin_percentage: number;
  status: "unprofitable" | "low_margin" | "profitable";
  log_count: number;
  last_synced_at: string;
}

/**
 * Fetches the actual subscription price for a Lemon Squeezy variant.
 * Returns null if the API is unavailable (callers fall back to env var).
 */
async function fetchLemonSqueezyVariantPrice(
  variantId: string,
  lsApiKey: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/variants/${encodeURIComponent(variantId)}`,
      {
        headers: {
          Authorization: `Bearer ${lsApiKey}`,
          Accept: "application/vnd.api+json",
        },
      }
    );

    if (!res.ok) {
      console.warn(`[margin-sync] Lemon Squeezy variants API returned ${res.status} for variant ${variantId}`);
      return null;
    }

    const data = await res.json();
    const priceCents: number | undefined = data?.data?.attributes?.price;

    if (typeof priceCents === "number" && priceCents > 0) {
      return Number((priceCents / 100).toFixed(2));
    }

    return null;
  } catch (err) {
    console.warn(`[margin-sync] Error fetching Lemon Squeezy variant price for ${variantId}:`, err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  return handleMarginSync(req);
}

export async function POST(req: NextRequest) {
  return handleMarginSync(req);
}

async function handleMarginSync(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  try {
    // ── 1. Resolve the pro subscription price from Lemon Squeezy (once per sync) ──
    const lsApiKey = process.env.LEMONSQUEEZY_API_KEY || "";
    const lsVariantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID || "";
    const lsFallbackPriceUSD = Number(process.env.LEMONSQUEEZY_PRO_PRICE_USD ?? 29);

    let proPriceUSD = lsFallbackPriceUSD;
    let proPriceIsLive = false;

    if (lsApiKey && lsVariantId) {
      const fetchedPrice = await fetchLemonSqueezyVariantPrice(lsVariantId, lsApiKey);
      if (fetchedPrice !== null) {
        proPriceUSD = fetchedPrice;
        proPriceIsLive = true;
        console.log(`[margin-sync] Resolved Pro subscription price: $${proPriceUSD} (live from Lemon Squeezy)`);
      } else {
        console.warn(`[margin-sync] Falling back to env LEMONSQUEEZY_PRO_PRICE_USD=$${lsFallbackPriceUSD}`);
      }
    }

    // ── 2. Fetch user profiles from public.profiles (Lemon Squeezy as source of truth) ──
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, plan, subscription_status, lemon_squeezy_customer_id, lemon_squeezy_subscription_id");

    if (profileError) {
      console.warn("[margin-sync] Profile fetch notice:", profileError.message);
    }

    // ── 3. Fallback: list auth users if profiles table is empty ──
    let usersList: {
      id: string;
      email: string;
      plan: string;
      subscription_status: string | null;
      lemon_squeezy_customer_id: string | null;
      lemon_squeezy_subscription_id: string | null;
    }[] = [];

    if (profiles && profiles.length > 0) {
      usersList = profiles.map((p) => ({
        id: String(p.id),
        email: String(p.email || "user@example.com"),
        plan: String(p.plan || "free").toLowerCase(),
        subscription_status: p.subscription_status ? String(p.subscription_status) : null,
        lemon_squeezy_customer_id: p.lemon_squeezy_customer_id ? String(p.lemon_squeezy_customer_id) : null,
        lemon_squeezy_subscription_id: p.lemon_squeezy_subscription_id ? String(p.lemon_squeezy_subscription_id) : null,
      }));
    } else {
      try {
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        if (authUsers?.users) {
          usersList = authUsers.users.map((u) => ({
            id: u.id,
            email: u.email || "user@example.com",
            plan: "free",
            subscription_status: null,
            lemon_squeezy_customer_id: null,
            lemon_squeezy_subscription_id: null,
          }));
        }
      } catch (err) {
        console.warn("[margin-sync] Could not list auth users:", err);
      }
    }

    // ── 4. Aggregate LLM cost and request count per user from usage_logs ──
    const { data: logs, error: logsError } = await supabaseAdmin
      .from("usage_logs")
      .select("user_id, total_cost_usd, cost");

    if (logsError) {
      console.warn("[margin-sync] usage_logs fetch notice:", logsError.message);
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

    // Handle orphan logs
    if (userCostMap["orphan"] && !usersList.some((u) => u.id === "orphan")) {
      usersList.push({
        id: "orphan",
        email: "unassigned@telemetry.local",
        plan: "free",
        subscription_status: null,
        lemon_squeezy_customer_id: null,
        lemon_squeezy_subscription_id: null,
      });
    }

    const nowIso = new Date().toISOString();

    // ── 5. Compute revenue and margins for each customer ──
    const customerMargins: CustomerMarginItem[] = usersList.map((u) => {
      let revenue = 0;
      let revenueSource: RevenueSource = "free";
      let isRevenueEstimated = false;

      const isActivePro =
        u.plan === "pro" &&
        (u.subscription_status === "active" || u.subscription_status === "on_trial");

      const isInactivePro =
        u.plan === "pro" && !isActivePro;

      if (isActivePro) {
        // Active/on-trial Pro subscriber — confirmed revenue from Lemon Squeezy pricing
        revenue = proPriceUSD;
        revenueSource = "lemonsqueezy_active";
        // Revenue is only truly confirmed if the LS API returned a live price;
        // if we fell back to the env var, mark as estimated.
        isRevenueEstimated = !proPriceIsLive;
      } else if (isInactivePro) {
        // Cancelled/past-due Pro — subscription is no longer active, use price as estimate
        revenue = proPriceUSD;
        revenueSource = "plan_estimate";
        isRevenueEstimated = true;
      } else {
        // Free tier — confirmed zero revenue
        revenue = 0;
        revenueSource = "free";
        isRevenueEstimated = false;
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
        lemon_squeezy_customer_id: u.lemon_squeezy_customer_id,
        lemon_squeezy_subscription_id: u.lemon_squeezy_subscription_id,
        plan: u.plan,
        subscription_status: u.subscription_status,
        revenue,
        revenue_source: revenueSource,
        is_revenue_estimated: isRevenueEstimated,
        total_cost: totalCost,
        margin,
        margin_percentage: marginPercentage,
        status,
        log_count: costData.log_count,
        last_synced_at: nowIso,
      };
    });

    // Sort by lowest margin first to highlight unprofitable/high-cost users
    customerMargins.sort((a, b) => a.margin - b.margin);

    // ── 6. Persist to customer_margins table if it exists ──
    try {
      await supabaseAdmin.from("customer_margins").upsert(
        customerMargins.map((c) => ({
          user_id: c.user_id,
          email: c.email,
          lemon_squeezy_customer_id: c.lemon_squeezy_customer_id,
          lemon_squeezy_subscription_id: c.lemon_squeezy_subscription_id,
          plan: c.plan,
          subscription_status: c.subscription_status,
          revenue: c.revenue,
          revenue_source: c.revenue_source,
          is_revenue_estimated: c.is_revenue_estimated,
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
        pro_price_usd: proPriceUSD,
        pro_price_is_live: proPriceIsLive,
        synced_at: nowIso,
        customers: customerMargins,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("[margin-sync] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
