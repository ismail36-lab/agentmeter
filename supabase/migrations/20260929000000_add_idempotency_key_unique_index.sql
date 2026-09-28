-- Migration: Add partial unique index on usage_logs(idempotency_key) to prevent duplicate log ingestions
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_logs_idempotency_key ON public.usage_logs (idempotency_key) WHERE idempotency_key IS NOT NULL;
