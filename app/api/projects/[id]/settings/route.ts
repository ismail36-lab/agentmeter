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

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, name, retention_days, created_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[project settings GET] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: data });
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
      { error: auth.reason ?? "Forbidden" },
      { status: 403 }
    );
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
    patch.retention_days = rawDays as RetentionDays;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided to update" },
      { status: 400 }
    );
  }

  patch.updated_at = new Date().toISOString();

  const { data, error: updateError } = await supabaseAdmin
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select("id, name, retention_days, updated_at")
    .maybeSingle();

  if (updateError) {
    console.error("[project settings PATCH] DB error:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    project: data,
    updatedBy: auth.userId,
    updaterRole: auth.role,
  });
}
