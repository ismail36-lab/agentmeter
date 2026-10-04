-- Migration: Lock down increment_key_spend to service_role only.
-- Root cause: CREATE FUNCTION implicitly grants EXECUTE to PUBLIC (which
-- includes anon/authenticated) unless explicitly revoked. The prior migration
-- also added explicit grants to anon/authenticated that were never needed —
-- every call site in the codebase uses the service-role admin client.

REVOKE EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) FROM anon;

-- Re-affirm the only grant that should exist.
GRANT EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) TO service_role;
