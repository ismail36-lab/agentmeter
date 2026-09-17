/**
 * In-process sliding-window rate limiter.
 *
 * Why in-process (not Redis)?
 * - No Redis/Upstash is provisioned in this project.
 * - Vercel serverless functions keep warm instances alive across requests,
 *   so this catches rapid bursts from the same caller on the same instance.
 * - For true distributed rate-limiting across all instances, swap the Map
 *   for an Upstash Redis INCR+EXPIRE call — the interface is identical.
 *
 * Algorithm: fixed 60-second window per key.
 *   - On each request: if the stored window has expired, reset counter to 1.
 *   - Otherwise increment the counter.
 *   - If counter > limit → reject with 429.
 *
 * Plan limits (requests per minute):
 *   free:       60 req/min
 *   pro:     1,000 req/min
 *   enterprise: unlimited (no check)
 */

const WINDOW_MS = 60_000; // 1 minute

/** Per-plan request-per-minute caps */
export const RATE_LIMITS: Record<string, number> = {
  free: 60,
  pro: 1_000,
  enterprise: Infinity,
};

interface WindowEntry {
  count: number;
  windowStart: number; // epoch ms
}

// Module-level Map persists across requests within the same warm instance
const rateLimitStore = new Map<string, WindowEntry>();

export interface RateLimitResult {
  allowed: boolean;
  /** Requests used in the current window */
  current: number;
  /** Requests allowed per window for this plan */
  limit: number;
  /** Milliseconds until the current window resets */
  retryAfterMs: number;
}

/**
 * Check and record a request for the given key + plan.
 *
 * @param keyId   - The api_keys.id value (stable identifier, never the raw secret)
 * @param plan    - The user's plan string: "free" | "pro" | "enterprise"
 */
export function checkRateLimit(keyId: string, plan: string): RateLimitResult {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  // Unlimited plan — skip tracking entirely
  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit: Infinity, retryAfterMs: 0 };
  }

  const now = Date.now();
  const entry = rateLimitStore.get(keyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // Start a fresh window
    rateLimitStore.set(keyId, { count: 1, windowStart: now });
    return { allowed: true, current: 1, limit, retryAfterMs: 0 };
  }

  // Still inside the current window
  entry.count += 1;
  const retryAfterMs = WINDOW_MS - (now - entry.windowStart);

  if (entry.count > limit) {
    return { allowed: false, current: entry.count, limit, retryAfterMs };
  }

  return { allowed: true, current: entry.count, limit, retryAfterMs: 0 };
}

/**
 * Periodically prune stale entries to prevent unbounded Map growth.
 * Call this from a cron route or let the GC handle it on instance recycle.
 */
export function pruneRateLimitStore(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart >= WINDOW_MS * 2) {
      rateLimitStore.delete(key);
      pruned++;
    }
  }
  return pruned;
}
