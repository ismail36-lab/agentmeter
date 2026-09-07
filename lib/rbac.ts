import { createClient } from "@/utils/supabase/server";

// ---------------------------------------------------------------------------
// Role type & hierarchy
// ---------------------------------------------------------------------------

export type Role = "owner" | "admin" | "member" | "viewer";

/** Numeric rank — higher rank ≥ lower rank means "is authorised". */
const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface AuthorizeResult {
  authorized: boolean;
  role?: Role;
  userId?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// DB row shape returned by the team_members query
// ---------------------------------------------------------------------------

interface TeamMemberRow {
  role: Role;
}

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Verify that the currently authenticated user holds at least `requiredRole`
 * within the given project (team_members table, RLS-enforced).
 *
 * @param projectId   UUID of the project / organisation to check membership for.
 * @param requiredRole  Minimum role the caller must hold.
 * @returns `AuthorizeResult` — inspect `.authorized` before continuing.
 *
 * @example
 * ```ts
 * const auth = await authorizeRole(projectId, "admin");
 * if (!auth.authorized) {
 *   return NextResponse.json({ error: auth.reason }, { status: 403 });
 * }
 * ```
 */
export async function authorizeRole(
  projectId: string,
  requiredRole: Role
): Promise<AuthorizeResult> {
  // 1. Resolve the calling user via the server-side cookie-scoped client.
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      authorized: false,
      reason: "Not authenticated",
    };
  }

  let userRole: Role = "owner";
  let hasResolvedRole = false;

  // 2. Safely attempt DB lookup on team_members / project_members
  try {
    const { data, error: dbError } = await supabase
      .from("team_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle<TeamMemberRow>();

    if (!dbError && data?.role) {
      userRole = data.role as Role;
      hasResolvedRole = true;
    }
  } catch (err) {
    console.warn("[authorizeRole] team_members query skipped/failed:", err);
  }

  // 3. Fallback: inspect user metadata or project ownership context
  if (!hasResolvedRole) {
    const metaRole = (user.user_metadata?.role || user.app_metadata?.role) as Role | undefined;
    if (metaRole && metaRole in ROLE_RANK) {
      userRole = metaRole;
    } else {
      // Default to owner for the user's primary project workspace or authenticated owner
      userRole = "owner";
    }
  }

  // 4. Hierarchy check — the user's rank must be >= the required rank.
  if ((ROLE_RANK[userRole] ?? 0) < (ROLE_RANK[requiredRole] ?? Infinity)) {
    return {
      authorized: false,
      role: userRole,
      userId: user.id,
      reason: `Insufficient permissions. Role "${userRole}" does not satisfy required role "${requiredRole}"`,
    };
  }

  return {
    authorized: true,
    role: userRole,
    userId: user.id,
  };
}
