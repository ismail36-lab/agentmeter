import { checkRateLimit as checkRateLimitCore, checkInMemoryRateLimit, RateLimitResult } from "./rate-limit";

export type { RateLimitResult };

export const RATE_LIMITS: Record<string, number> = {
  free: 60,
  pro: 1_000,
  enterprise: Infinity,
};

/**
 * Check and record a request asynchronously using Upstash Redis if configured,
 * falling back to the in-memory sliding window limiter (fail-closed).
 */
export async function checkRateLimitAsync(keyId: string, plan: string = "free"): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit: Infinity, retryAfterMs: 0 };
  }

  return checkRateLimitCore(keyId, limit);
}

/**
 * Synchronous check using in-process sliding window.
 */
export function checkRateLimit(keyId: string, plan: string = "free"): RateLimitResult {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit: Infinity, retryAfterMs: 0 };
  }

  return checkInMemoryRateLimit(keyId, limit);
}
