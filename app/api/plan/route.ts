import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const TIER_LIMITS: Record<string, { name: string; limit: number; label: string }> = {
  free: { name: "Free Sandbox", limit: 5000, label: "5,000 logs/mo" },
  pro: { name: "Pro Tier", limit: 500000, label: "500,000 logs/mo" },
};

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    // Read plan: check public.profiles (single source of truth)
    let rawPlan = "free";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.plan) {
      rawPlan = String(profile.plan).toLowerCase();
    }

    const planKey = rawPlan in TIER_LIMITS ? rawPlan : "free";
    const tier = TIER_LIMITS[planKey];

    // Count monthly log usage for this user
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count } = await supabaseAdmin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .gte("created_at", firstDayOfMonth);

    const usageCount = count ?? 0;
    const percentage = Math.min(100, Number(((usageCount / tier.limit) * 100).toFixed(1)));
    const remaining = Math.max(0, tier.limit - usageCount);

    return NextResponse.json(
      {
        plan: planKey,
        tierName: tier.name,
        limit: tier.limit,
        limitLabel: tier.label,
        usage: usageCount,
        percentage,
        remaining,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("plan GET exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Plan upgrades must be completed via Lemon Squeezy checkout." },
    {
      status: 405,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    }
  );
}
