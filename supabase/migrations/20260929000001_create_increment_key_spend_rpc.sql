-- Migration: Create atomic RPC function to increment current_period_spend_usd on api_keys
CREATE OR REPLACE FUNCTION public.increment_key_spend(key_id UUID, amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_keys
  SET current_period_spend_usd = COALESCE(current_period_spend_usd, 0) + amount
  WHERE id = key_id;
END;
$$;

-- Grant execution to all standard Supabase database roles
GRANT EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_key_spend(UUID, NUMERIC) TO anon;
