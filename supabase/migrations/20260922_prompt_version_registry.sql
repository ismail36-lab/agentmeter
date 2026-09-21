-- Migration: Prompt Version Registry & Unit Economics Attribution
-- Created: 2026-09-22

-- 1. Prompts Parent Table
CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_prompt_slug_per_user UNIQUE (user_id, slug)
);

-- 2. Prompt Versions Table
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES public.prompts(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  template_text TEXT NOT NULL,
  model TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_version_per_prompt UNIQUE (prompt_id, version)
);

-- 3. Add prompt_version_id to usage_logs if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usage_logs'
      AND column_name = 'prompt_version_id'
  ) THEN
    ALTER TABLE public.usage_logs ADD COLUMN prompt_version_id TEXT;
  END IF;
END $$;

-- Performance index for fast unit economics aggregations
CREATE INDEX IF NOT EXISTS idx_usage_logs_prompt_version_id
  ON public.usage_logs (prompt_version_id);

-- RLS Policies
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prompts_select_policy" ON public.prompts;
DROP POLICY IF EXISTS "prompts_insert_policy" ON public.prompts;
DROP POLICY IF EXISTS "prompts_update_policy" ON public.prompts;
DROP POLICY IF EXISTS "prompts_delete_policy" ON public.prompts;

CREATE POLICY "prompts_select_policy" ON public.prompts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.is_project_member(project_id)));

CREATE POLICY "prompts_insert_policy" ON public.prompts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id)));

CREATE POLICY "prompts_update_policy" ON public.prompts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id)));

CREATE POLICY "prompts_delete_policy" ON public.prompts FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (project_id IS NOT NULL AND public.is_project_owner_or_admin(project_id)));

DROP POLICY IF EXISTS "prompt_versions_select_policy" ON public.prompt_versions;
DROP POLICY IF EXISTS "prompt_versions_insert_policy" ON public.prompt_versions;

CREATE POLICY "prompt_versions_select_policy" ON public.prompt_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.prompts WHERE id = prompt_id AND (user_id = auth.uid() OR public.is_project_member(project_id))));

CREATE POLICY "prompt_versions_insert_policy" ON public.prompt_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.prompts WHERE id = prompt_id AND (user_id = auth.uid() OR public.is_project_owner_or_admin(project_id))));
