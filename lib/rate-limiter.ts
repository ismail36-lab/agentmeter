import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const WINDOW_MS = 60_000; // 1 minute

/** Per-plan request-per-minute caps */
export const RATE_LIMITS: Record<string, number> = {
  free: 60,
  pro: 1_000,
  enterprise: Infinity,
};

export interface RateLimitResult {
  allowed: boolean;
  /** Requests used in the current window */
  current: number;
  /** Requests allowed per window for this plan */
  limit: number;
  /** Milliseconds until the current window resets */
  retryAfterMs: number;
}

// ── Upstash Redis Client & Ratelimiters ──────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = (redisUrl && redisToken)
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

const ratelimiters = new Map<number, Ratelimit>();

function getUpstashRatelimiter(limit: number): Ratelimit | null {
  if (!redis) return null;
  if (!ratelimiters.has(limit)) {
    ratelimiters.set(
      limit,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, "60 s"),
        analytics: true,
        prefix: "@upstash/ratelimit",
      })
    );
  }
  return ratelimiters.get(limit)!;
}

// ── In-Memory Fallback Store ──────────────────────────────────────────────────
interface WindowEntry {
  count: number;
  windowStart: number; // epoch ms
}

const rateLimitStore = new Map<string, WindowEntry>();

/**
 * Check and record a request asynchronously using Upstash Redis if configured,
 * falling back to the in-memory sliding window limiter.
 *
 * @param keyId   - The identifier (API key ID, API key string, or IP address)
 * @param plan    - The plan string: "free" | "pro" | "enterprise"
 */
export async function checkRateLimitAsync(keyId: string, plan: string = "free"): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit: Infinity, retryAfterMs: 0 };
  }

  const ratelimiter = getUpstashRatelimiter(limit);
  if (ratelimiter) {
    try {
      const res = await ratelimiter.limit(keyId);
      const retryAfterMs = Math.max(0, res.reset - Date.now());
      return {
        allowed: res.success,
        current: limit - res.remaining,
        limit,
        retryAfterMs,
      };
    } catch (err) {
      console.warn("[rate-limiter] Upstash Redis lookup failed, falling back to memory:", err);
    }
  }

  return checkRateLimit(keyId, plan);
}

/**
 * Synchronous check using in-process sliding window.
 */
export function checkRateLimit(keyId: string, plan: string = "free"): RateLimitResult {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit: Infinity, retryAfterMs: 0 };
  }

  const now = Date.now();
  const entry = rateLimitStore.get(keyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rateLimitStore.set(keyId, { count: 1, windowStart: now });
    return { allowed: true, current: 1, limit, retryAfterMs: 0 };
  }

  entry.count += 1;
  const retryAfterMs = WINDOW_MS - (now - entry.windowStart);

  if (entry.count > limit) {
    return { allowed: false, current: entry.count, limit, retryAfterMs };
  }

  return { allowed: true, current: entry.count, limit, retryAfterMs: 0 };
}

/**
 * Periodically prune stale in-memory entries to prevent unbounded Map growth.
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

