-- Migration: Aggregate usage_logs cost/count server-side to avoid PostgREST's
-- default 1,000-row cap on unbounded selects.

CREATE OR REPLACE FUNCTION public.get_user_cost_summary(p_user_id UUID)
RETURNS TABLE(total_cost NUMERIC, log_count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(COALESCE(total_cost_usd, cost, 0)), 0)::numeric AS total_cost,
    COUNT(*)::bigint AS log_count
  FROM public.usage_logs
  WHERE user_id = p_user_id;
$$;

-- Lock down execute permissions strictly to service_role
GRANT EXECUTE ON FUNCTION public.get_user_cost_summary(UUID) TO service_role;
