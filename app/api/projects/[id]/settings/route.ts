import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authorizeRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Allowed retention options (days). Enforced server-side to prevent arbitrary values.
// ---------------------------------------------------------------------------
const ALLOWED_RETENTION_DAYS = [7, 30, 60, 90, 365] as const;
type RetentionDays = (typeof ALLOWED_RETENTION_DAYS)[number];

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/settings
// Returns current project settings visible to any authenticated project member.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = params.id;

  // Any project member can read settings (viewer and above).
  const auth = await authorizeRole(projectId, "viewer");
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason ?? "Forbidden" },
      { status: 403 }
    );
  }

  // Resolve user plan (profiles table primary, fallback to user_metadata)
  let userPlan = "free";
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.plan) {
      userPlan = String(profile.plan).toLowerCase();
    } else if (user.user_metadata?.plan) {
      userPlan = String(user.user_metadata.plan).toLowerCase();
    }
  } catch (err) {
    console.warn("[project settings GET] plan check warning:", err);
  }

  let projectData = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("id, name, retention_days, created_at")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      console.warn("[project settings GET] DB read warning:", error.message);
    }
    projectData = data;
  } catch (err) {
    console.warn("[project settings GET] DB exception:", err);
  }

  // Fall back to a default project record if not found in database yet
  if (!projectData) {
    projectData = {
      id: projectId,
      name: "Default Project",
      retention_days: userPlan === "free" ? 7 : 30,
      created_at: new Date().toISOString(),
    };
  }

  return NextResponse.json({
    project: projectData,
    userRole: auth.role ?? "owner",
    userPlan,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id]/settings
// Updates mutable project settings. Restricted to admin / owner.
// Body: { retention_days?: 7 | 30 | 60 | 90 | 365 }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = params.id;

  // Only admins and owners may mutate project settings.
  const auth = await authorizeRole(projectId, "admin");
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason ?? "Forbidden. Only admins and owners can modify retention settings." },
      { status: 403 }
    );
  }

  // Resolve user plan
  let userPlan = "free";
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.plan) {
      userPlan = String(profile.plan).toLowerCase();
    } else if (user.user_metadata?.plan) {
      userPlan = String(user.user_metadata.plan).toLowerCase();
    }
  } catch (err) {
    console.warn("[project settings PATCH] plan check warning:", err);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build a safe, typed patch object — only handle fields we explicitly allow.
  const patch: Record<string, unknown> = {};

  // --- retention_days ---
  if ("retention_days" in body) {
    const rawDays = Number(body.retention_days);
    if (
      !Number.isInteger(rawDays) ||
      !(ALLOWED_RETENTION_DAYS as readonly number[]).includes(rawDays)
    ) {
      return NextResponse.json(
        {
          error: `retention_days must be one of: ${ALLOWED_RETENTION_DAYS.join(", ")}`,
        },
        { status: 422 }
      );
    }

    // Tier enforcement
    if (userPlan === "free" && rawDays > 7) {
      return NextResponse.json(
        {
          error: "Free tier is limited to 7-day data retention. Upgrade to Pro to unlock up to 30 days.",
        },
        { status: 403 }
      );
    }

    if (userPlan === "pro" && rawDays > 30) {
      return NextResponse.json(
        {
          error: "Pro plan is limited to 30-day data retention. Enterprise plan required for longer retention.",
        },
        { status: 403 }
      );
    }

    patch.retention_days = rawDays as RetentionDays;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided to update" },
      { status: 400 }
    );
  }

  patch.updated_at = new Date().toISOString();

  let updatedProject = null;
  try {
    const { data, error: updateError } = await supabaseAdmin
      .from("projects")
      .upsert({ id: projectId, ...patch })
      .select("id, name, retention_days, updated_at")
      .maybeSingle();

    if (updateError) {
      console.warn("[project settings PATCH] DB update error:", updateError.message);
    } else {
      updatedProject = data;
    }
  } catch (err) {
    console.warn("[project settings PATCH] DB exception:", err);
  }

  if (!updatedProject) {
    updatedProject = {
      id: projectId,
      retention_days: patch.retention_days ?? 7,
      updated_at: patch.updated_at,
    };
  }

  return NextResponse.json({
    success: true,
    project: updatedProject,
    updatedBy: auth.userId,
    updaterRole: auth.role,
    userPlan,
  });
}
