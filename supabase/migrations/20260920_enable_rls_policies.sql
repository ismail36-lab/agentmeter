-- Migration: Enable Row Level Security (RLS) Policies on Core Tables
-- Created: 2026-09-20
-- Description: Enables RLS on usage_logs, customer_margins, api_keys, team_members, and projects.
-- Enforces tenant isolation for authenticated users while ensuring service_role bypasses RLS naturally.

-- ============================================================================
-- 1. HELPER SECURITY DEFINER FUNCTIONS (Prevents infinite RLS recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND (owner_id = auth.uid() OR user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner_or_admin(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND (owner_id = auth.uid() OR user_id = auth.uid())
  );
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner_or_admin(UUID) TO authenticated;


-- ============================================================================
-- 2. PROJECTS TABLE RLS
-- ============================================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_policy" ON public.projects;

CREATE POLICY "projects_select_policy" ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    owner_id = auth.uid() OR
    public.is_project_member(id)
  );

CREATE POLICY "projects_insert_policy" ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    owner_id = auth.uid() OR
    auth.uid() IS NOT NULL
  );

CREATE POLICY "projects_update_policy" ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    owner_id = auth.uid() OR
    public.is_project_owner_or_admin(id)
  )
  WITH CHECK (
    user_id = auth.uid() OR
    owner_id = auth.uid() OR
    public.is_project_owner_or_admin(id)
  );

CREATE POLICY "projects_delete_policy" ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    owner_id = auth.uid()
  );


-- ============================================================================
-- 3. TEAM_MEMBERS TABLE RLS
-- ============================================================================

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_select_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete_policy" ON public.team_members;

CREATE POLICY "team_members_select_policy" ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    public.is_project_member(project_id)
  );

CREATE POLICY "team_members_insert_policy" ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_project_owner_or_admin(project_id)
  );

CREATE POLICY "team_members_update_policy" ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_project_owner_or_admin(project_id)
  )
  WITH CHECK (
    public.is_project_owner_or_admin(project_id)
  );

CREATE POLICY "team_members_delete_policy" ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    public.is_project_owner_or_admin(project_id)
  );


-- ============================================================================
-- 4. API_KEYS TABLE RLS
-- ============================================================================

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_delete_policy" ON public.api_keys;

CREATE POLICY "api_keys_select_policy" ON public.api_keys
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_member(project_id))
  );

CREATE POLICY "api_keys_insert_policy" ON public.api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id))
  );

CREATE POLICY "api_keys_update_policy" ON public.api_keys
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id))
  );

CREATE POLICY "api_keys_delete_policy" ON public.api_keys
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id))
  );


-- ============================================================================
-- 5. USAGE_LOGS TABLE RLS
-- ============================================================================

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_logs_select_policy" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs_insert_policy" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs_update_policy" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs_delete_policy" ON public.usage_logs;

CREATE POLICY "usage_logs_select_policy" ON public.usage_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_member(project_id))
  );

CREATE POLICY "usage_logs_insert_policy" ON public.usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    (project_id IS NOT NULL AND public.is_project_member(project_id))
  );

CREATE POLICY "usage_logs_update_policy" ON public.usage_logs
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "usage_logs_delete_policy" ON public.usage_logs
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
  );


-- ============================================================================
-- 6. CUSTOMER_MARGINS TABLE RLS
-- ============================================================================

ALTER TABLE public.customer_margins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_margins_select_policy" ON public.customer_margins;
DROP POLICY IF EXISTS "customer_margins_insert_policy" ON public.customer_margins;
DROP POLICY IF EXISTS "customer_margins_update_policy" ON public.customer_margins;
DROP POLICY IF EXISTS "customer_margins_delete_policy" ON public.customer_margins;

CREATE POLICY "customer_margins_select_policy" ON public.customer_margins
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "customer_margins_insert_policy" ON public.customer_margins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "customer_margins_update_policy" ON public.customer_margins
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "customer_margins_delete_policy" ON public.customer_margins
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
  );
