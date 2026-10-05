-- Migration: Add index on usage_logs(session_id) for session rollup and tracking queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_id ON public.usage_logs (session_id) WHERE session_id IS NOT NULL;
