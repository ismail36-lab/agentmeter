import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Authorize via CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Thresholds
    const freeCutoff = new Date(now);
    freeCutoff.setUTCDate(freeCutoff.getUTCDate() - 3);

    const proCutoff = new Date(now);
    proCutoff.setUTCDate(proCutoff.getUTCDate() - 30);

    // 2. Fetch all organizations with their plan_type
    const { data: orgs, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("id, plan_type");

    if (orgsError) {
      console.error("Cron cleanup: failed to fetch organizations:", orgsError.message);
      return NextResponse.json({ error: orgsError.message }, { status: 500 });
    }

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: "No organizations found", deleted: 0 });
    }

    // Partition org IDs by plan
    const freeOrgIds = orgs
      .filter((o) => !o.plan_type || o.plan_type === "free")
      .map((o) => o.id);

    const proOrgIds = orgs
      .filter((o) => o.plan_type === "pro" || o.plan_type === "enterprise")
      .map((o) => o.id);

    let totalDeleted = 0;
    const errors: string[] = [];

    // 3. Delete usage_logs older than 3 days for free-tier orgs
    if (freeOrgIds.length > 0) {
      const { count, error: freeError } = await supabaseAdmin
        .from("usage_logs")
        .delete({ count: "exact" })
        .in("organization_id", freeOrgIds)
        .lt("created_at", freeCutoff.toISOString());

      if (freeError) {
        console.error("Cron cleanup: free tier delete error:", freeError.message);
        errors.push(`free: ${freeError.message}`);
      } else {
        totalDeleted += count ?? 0;
      }
    }

    // 4. Delete usage_logs older than 30 days for pro/enterprise orgs
    if (proOrgIds.length > 0) {
      const { count, error: proError } = await supabaseAdmin
        .from("usage_logs")
        .delete({ count: "exact" })
        .in("organization_id", proOrgIds)
        .lt("created_at", proCutoff.toISOString());

      if (proError) {
        console.error("Cron cleanup: pro tier delete error:", proError.message);
        errors.push(`pro: ${proError.message}`);
      } else {
        totalDeleted += count ?? 0;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      deleted: totalDeleted,
      cutoffs: {
        free: freeCutoff.toISOString(),
        pro: proCutoff.toISOString(),
      },
      orgs_processed: {
        free: freeOrgIds.length,
        pro: proOrgIds.length,
      },
      ...(errors.length > 0 && { errors }),
    });
  } catch (error: any) {
    console.error("Cron cleanup: unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500 }
    );
  }
}
