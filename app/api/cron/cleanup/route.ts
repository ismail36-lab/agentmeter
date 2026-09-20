import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ProjectRetentionItem {
  id: string;
  name: string | null;
  user_id: string | null;
  owner_id: string | null;
  retention_days: number | null;
}

interface ProfilePlanItem {
  id: string;
  plan: string | null;
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
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
    const now = new Date();

    // 1. Fetch user profiles to know default tier retention if project setting is missing
    const userPlanMap: Record<string, string> = {};
    try {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, plan");

      if (profiles) {
        (profiles as ProfilePlanItem[]).forEach((p) => {
          if (p.id) {
            userPlanMap[String(p.id)] = String(p.plan || "free").toLowerCase();
          }
        });
      }
    } catch (err) {
      console.warn("[cron-cleanup] Profile fetch notice:", err);
    }

    // 2. Fetch all projects from public.projects
    const { data: projects, error: projectsErr } = await supabaseAdmin
      .from("projects")
      .select("id, name, user_id, owner_id, retention_days");

    if (projectsErr) {
      console.error("[cron-cleanup] Failed to fetch projects:", projectsErr.message);
    }

    const projectsList: ProjectRetentionItem[] = (projects as ProjectRetentionItem[]) || [];

    let totalDeleted = 0;
    const projectStats: {
      project_id: string;
      name: string;
      user_id: string | null;
      retention_days: number;
      deleted: number;
      cutoff: string;
    }[] = [];
    const errors: string[] = [];

    // Track processed project IDs and user IDs to handle orphans later
    const processedProjectIds = new Set<string>();
    const processedUserIds = new Set<string>();

    // 3. Process retention cleanup for each project
    for (const proj of projectsList) {
      processedProjectIds.add(proj.id);
      const ownerId = proj.user_id || proj.owner_id;
      if (ownerId) processedUserIds.add(ownerId);

      // Resolve retention days: explicit setting > owner profile plan default > 30 days default
      let retentionDays = proj.retention_days;
      if (typeof retentionDays !== "number" || retentionDays <= 0) {
        const ownerPlan = ownerId ? userPlanMap[ownerId] : "free";
        retentionDays = ownerPlan === "free" ? 7 : 30;
      }

      const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      const cutoffIso = cutoffDate.toISOString();

      let projectDeletedCount = 0;

      // Delete by project_id in usage_logs
      try {
        const { count: projDeleted, error: projDelErr } = await supabaseAdmin
          .from("usage_logs")
          .delete({ count: "exact" })
          .eq("project_id", proj.id)
          .lt("created_at", cutoffIso);

        if (projDelErr) {
          console.warn(`[cron-cleanup] Project ${proj.id} delete error:`, projDelErr.message);
          errors.push(`project ${proj.id}: ${projDelErr.message}`);
        } else {
          projectDeletedCount += projDeleted ?? 0;
        }
      } catch (err: any) {
        console.warn(`[cron-cleanup] Exception deleting logs for project ${proj.id}:`, err);
        errors.push(`project ${proj.id}: ${err.message || String(err)}`);
      }

      // Also clean up by user_id if logs have matching user_id but missing project_id
      if (ownerId) {
        try {
          const { count: userLogsDeleted, error: userDelErr } = await supabaseAdmin
            .from("usage_logs")
            .delete({ count: "exact" })
            .eq("user_id", ownerId)
            .is("project_id", null)
            .lt("created_at", cutoffIso);

          if (!userDelErr) {
            projectDeletedCount += userLogsDeleted ?? 0;
          }
        } catch {
          // Ignore secondary cleanup errors
        }
      }

      totalDeleted += projectDeletedCount;
      projectStats.push({
        project_id: proj.id,
        name: proj.name || "Default Project",
        user_id: ownerId,
        retention_days: retentionDays,
        deleted: projectDeletedCount,
        cutoff: cutoffIso,
      });
    }

    // 4. Cleanup orphan/unassigned logs older than 30 days
    let orphanDeleted = 0;
    const defaultOrphanCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { count: orphanCount, error: orphanErr } = await supabaseAdmin
        .from("usage_logs")
        .delete({ count: "exact" })
        .is("project_id", null)
        .is("user_id", null)
        .lt("created_at", defaultOrphanCutoff);

      if (!orphanErr) {
        orphanDeleted = orphanCount ?? 0;
        totalDeleted += orphanDeleted;
      }
    } catch {
      // Ignore orphan cleanup errors
    }

    return NextResponse.json(
      {
        success: errors.length === 0,
        total_deleted: totalDeleted,
        projects_processed_count: projectStats.length,
        projects_processed: projectStats,
        orphan_deleted: orphanDeleted,
        executed_at: now.toISOString(),
        ...(errors.length > 0 && { errors }),
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: any) {
    console.error("[cron-cleanup] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
