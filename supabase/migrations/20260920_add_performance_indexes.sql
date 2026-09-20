-- Migration: Add Performance Indexes for High-Frequency Query Paths
-- Created: 2026-09-20
-- Description: Adds compound and single-column indexes on usage_logs, api_keys, and projects.

-- ============================================================================
-- 1. USAGE_LOGS INDEXES (Telemetry Aggregations & Dashboard Queries)
-- ============================================================================

-- Compound index for filtering usage logs by user ordered by timestamp descending
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created 
  ON public.usage_logs (user_id, created_at DESC);

-- Compound index for filtering usage logs by API key ordered by timestamp descending
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_created 
  ON public.usage_logs (api_key_id, created_at DESC);


-- ============================================================================
-- 2. API_KEYS INDEX (O(1) Ingest Telemetry Authentication Lookups)
-- ============================================================================

-- Single-column index on SHA-256 key_hash for instant API key resolution
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash 
  ON public.api_keys (key_hash);


-- ============================================================================
-- 3. PROJECTS INDEX (User Project Ownership Lookups)
-- ============================================================================

-- Single-column index on owner_id for user project listing
CREATE INDEX IF NOT EXISTS idx_projects_owner_id 
  ON public.projects (owner_id);
