import { supabaseAdmin } from "@/lib/supabase/admin";

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
  status: "unprofitable" | "low_margin" | "profitable" | "no_data" | "new_account";
  log_count: number;
  last_synced_at: string;
}

/**
 * Calculates customer margin metrics for a single specific user.
 * Scoped strictly to the target userId (does not perform full-platform scans).
 */
export async function calculateSingleCustomerMargin(
  userId: string,
  userEmail?: string
): Promise<CustomerMarginItem> {
  const nowIso = new Date().toISOString();

  // 1. Resolve Lemon Squeezy Pro pricing (env fallback)
  const lsFallbackPriceUSD = Number(process.env.LEMONSQUEEZY_PRO_PRICE_USD ?? 29);
  let proPriceUSD = lsFallbackPriceUSD;
  let proPriceIsLive = false;

  const lsApiKey = process.env.LEMONSQUEEZY_API_KEY || "";
  const lsVariantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID || "";

  if (lsApiKey && lsVariantId) {
    try {
      const res = await fetch(
        `https://api.lemonsqueezy.com/v1/variants/${encodeURIComponent(lsVariantId)}`,
        {
          headers: {
            Authorization: `Bearer ${lsApiKey}`,
            Accept: "application/vnd.api+json",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const priceCents: number | undefined = data?.data?.attributes?.price;
        if (typeof priceCents === "number" && priceCents > 0) {
          proPriceUSD = Number((priceCents / 100).toFixed(2));
          proPriceIsLive = true;
        }
      }
    } catch (err) {
      console.warn(`[customer-profitability] Variant price fetch notice for ${userId}:`, err);
    }
  }

  // 2. Fetch profile data specifically for this user
  let email = userEmail || "user@example.com";
  let plan = "free";
  let subscriptionStatus: string | null = null;
  let lemonSqueezyCustomerId: string | null = null;
  let lemonSqueezySubscriptionId: string | null = null;

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, plan, subscription_status, lemon_squeezy_customer_id, lemon_squeezy_subscription_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      if (profile.email) email = profile.email;
      if (profile.plan) plan = String(profile.plan).toLowerCase();
      subscriptionStatus = profile.subscription_status ? String(profile.subscription_status) : null;
      lemonSqueezyCustomerId = profile.lemon_squeezy_customer_id ? String(profile.lemon_squeezy_customer_id) : null;
      lemonSqueezySubscriptionId = profile.lemon_squeezy_subscription_id ? String(profile.lemon_squeezy_subscription_id) : null;
    } else {
      // Fallback: lookup user in auth.users
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authUser?.user?.email) {
        email = authUser.user.email;
      }
    }
  } catch (err) {
    console.warn(`[customer-profitability] Profile fetch notice for ${userId}:`, err);
  }

  // 3. Aggregate LLM usage log costs specifically for this user
  let totalCost = 0;
  let logCount = 0;

  try {
    const { data: logs, error: logsErr } = await supabaseAdmin
      .from("usage_logs")
      .select("total_cost_usd, cost")
      .eq("user_id", userId);

    if (!logsErr && logs) {
      logCount = logs.length;
      logs.forEach((log: any) => {
        const cost = Number(log.total_cost_usd ?? log.cost ?? 0);
        if (!isNaN(cost)) {
          totalCost += cost;
        }
      });
    }
  } catch (err) {
    console.warn(`[customer-profitability] usage_logs query notice for ${userId}:`, err);
  }

  // 4. Compute revenue & margins
  let revenue = 0;
  let revenueSource: RevenueSource = "free";
  let isRevenueEstimated = false;

  const isActivePro =
    plan === "pro" &&
    (subscriptionStatus === "active" || subscriptionStatus === "on_trial");

  const isInactivePro = plan === "pro" && !isActivePro;

  if (isActivePro) {
    revenue = proPriceUSD;
    revenueSource = "lemonsqueezy_active";
    isRevenueEstimated = !proPriceIsLive;
  } else if (isInactivePro) {
    revenue = proPriceUSD;
    revenueSource = "plan_estimate";
    isRevenueEstimated = true;
  } else {
    revenue = 0;
    revenueSource = "free";
    isRevenueEstimated = false;
  }

  const roundedTotalCost = Number(totalCost.toFixed(4));
  const margin = Number((revenue - roundedTotalCost).toFixed(4));

  let marginPercentage = 0;
  if (revenue > 0) {
    marginPercentage = Number(((margin / revenue) * 100).toFixed(1));
  } else if (roundedTotalCost > 0) {
    marginPercentage = -100;
  }

  let status: "unprofitable" | "low_margin" | "profitable" | "no_data" | "new_account" = "profitable";
  if (revenue === 0 && roundedTotalCost === 0) {
    status = "no_data";
  } else if (margin < 0) {
    status = "unprofitable";
  } else if (marginPercentage < 30 || margin < 10) {
    status = "low_margin";
  }

  const marginItem: CustomerMarginItem = {
    user_id: userId,
    email,
    lemon_squeezy_customer_id: lemonSqueezyCustomerId,
    lemon_squeezy_subscription_id: lemonSqueezySubscriptionId,
    plan,
    subscription_status: subscriptionStatus,
    revenue,
    revenue_source: revenueSource,
    is_revenue_estimated: isRevenueEstimated,
    total_cost: roundedTotalCost,
    margin,
    margin_percentage: marginPercentage,
    status,
    log_count: logCount,
    last_synced_at: nowIso,
  };

  // 5. Upsert single user margin record into customer_margins table
  try {
    await supabaseAdmin.from("customer_margins").upsert([
      {
        user_id: marginItem.user_id,
        email: marginItem.email,
        lemon_squeezy_customer_id: marginItem.lemon_squeezy_customer_id,
        lemon_squeezy_subscription_id: marginItem.lemon_squeezy_subscription_id,
        plan: marginItem.plan,
        subscription_status: marginItem.subscription_status,
        revenue: marginItem.revenue,
        revenue_source: marginItem.revenue_source,
        is_revenue_estimated: marginItem.is_revenue_estimated,
        total_cost: marginItem.total_cost,
        margin: marginItem.margin,
        margin_percentage: marginItem.margin_percentage,
        status: marginItem.status,
        updated_at: nowIso,
      },
    ]);
  } catch (err) {
    console.warn(`[customer-profitability] Upsert notice for ${userId}:`, err);
  }

  return marginItem;
}
