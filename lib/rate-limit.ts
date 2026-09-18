import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  allowed: boolean;
  current: number;
  retryAfterMs: number;
}

// ─────────────────────────────────────────────────────────────────────────
// In-Memory Sliding Window — FAIL-CLOSED safety net only
//
// IMPORTANT: On Vercel serverless (and most FaaS platforms), this Map is
// scoped to a single warm function instance. Under real traffic, Vercel can
// (and does) route sequential/concurrent requests to *different* instances,
// each with its own empty Map. That means this fallback CANNOT provide a
// globally-correct count the way Redis does — it only guarantees that a
// single instance never allows unlimited traffic through itself, and it
// guarantees we never silently return success on an error path.
//
// If you see all requests succeeding in a load test, the first thing to
// check is whether this fallback is the one actually running (see the
// "[rate-limit] Upstash env check" log line emitted below) rather than
// assuming this function itself is broken.
// ─────────────────────────────────────────────────────────────────────────
const memoryStore = new Map<string, number[]>();

export function checkInMemoryRateLimit(
  identifier: string,
  maxLimit: number = 60
): RateLimitResult {
  try {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    const timestamps = (memoryStore.get(identifier) || []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= maxLimit) {
      return {
        success: false,
        allowed: false,
        limit: maxLimit,
        remaining: 0,
        current: timestamps.length,
        retryAfterMs: Math.max(0, (timestamps[0] || now) + windowMs - now),
      };
    }

    timestamps.push(now);
    memoryStore.set(identifier, timestamps);

    return {
      success: true,
      allowed: true,
      limit: maxLimit,
      remaining: maxLimit - timestamps.length,
      current: timestamps.length,
      retryAfterMs: 0,
    };
  } catch (err) {
    console.error("[rate-limit] In-memory limiter threw — failing CLOSED:", err);
    // DO NOT default to allowing the request on error.
    return {
      success: false,
      allowed: false,
      limit: maxLimit,
      remaining: 0,
      current: maxLimit,
      retryAfterMs: 60_000,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Upstash Redis — ONE Ratelimit instance PER distinct limit value
//
// ROOT-CAUSE NOTE (previous version): @upstash/ratelimit bakes its window
// size into the Ratelimit instance at construction time
// (`Ratelimit.slidingWindow(60, "60 s")`). The old code built exactly one
// global instance hardcoded to 60/60s and reused it for every caller
// regardless of the `customLimit` argument passed in — so a Pro-tier
// caller's 1,000/min entitlement was never actually enforced at the Redis
// level; only the *reported* `limit` field varied, not the real ceiling.
// We now cache one Ratelimit instance per limit value (60, 1000, ...) so
// each plan gets its own correctly-sized sliding window and its own Redis
// keyspace (via a limit-specific prefix), so a Free and a Pro caller can
// never collide on the same counter.
// ─────────────────────────────────────────────────────────────────────────
let redisClient: Redis | null = null;
let loggedEnvCheck = false;
const limiterCache = new Map<number, Ratelimit>();

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // One unmistakable log line per cold start so a Vercel log search for
  // "[rate-limit] Upstash env check" immediately shows whether the deployed
  // function actually has credentials available at runtime — this is the
  // fastest way to confirm/rule out "env vars added but never redeployed".
  if (!loggedEnvCheck) {
    loggedEnvCheck = true;
    console.log(
      `[rate-limit] Upstash env check -> URL present: ${Boolean(redisUrl)}, TOKEN present: ${Boolean(redisToken)}`
    );
  }

  if (!redisUrl || !redisToken) return null;

  try {
    redisClient = new Redis({ url: redisUrl, token: redisToken });
    return redisClient;
  } catch (err) {
    console.error("[rate-limit] Failed to initialize Upstash Redis client:", err);
    redisClient = null;
    return null;
  }
}

function getUpstashLimiter(limit: number): Ratelimit | null {
  const client = getRedisClient();
  if (!client) return null;

  const cached = limiterCache.get(limit);
  if (cached) return cached;

  try {
    const instance = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, "60 s"),
      analytics: true,
      // Separate keyspace per tier so a 60/min and a 1,000/min caller can
      // never share (or collide on) the same Redis sliding-window key.
      prefix: `rate_limit:${limit}`,
    });
    limiterCache.set(limit, instance);
    return instance;
  } catch (err) {
    console.error(`[rate-limit] Failed to construct Ratelimit for limit=${limit}:`, err);
    return null;
  }
}

/**
 * Check and record one request against `identifier`'s sliding-window quota.
 *
 * `customLimit` MUST be the caller's resolved plan limit (e.g. 60 for Free,
 * 1000 for Pro) — see RATE_LIMITS in lib/rate-limiter.ts. Passing no limit
 * defaults to the Free tier's 60/min, which is the safe, conservative choice
 * for any caller whose plan could not yet be resolved.
 *
 * FAIL-CLOSED CONTRACT: every error path below falls back to the in-memory
 * limiter. Nothing in this function ever returns `success: true` purely
 * because Redis was unreachable.
 */
export async function checkRateLimit(
  identifier: string,
  customLimit: number = 60
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(customLimit);

  if (!limiter) {
    // Upstash not configured / failed to initialize this invocation.
    return checkInMemoryRateLimit(identifier, customLimit);
  }

  try {
    const res = await limiter.limit(identifier);
    const remaining = Math.max(0, res.remaining);

    return {
      success: res.success,
      allowed: res.success,
      limit: customLimit,
      remaining,
      current: customLimit - remaining,
      retryAfterMs: Math.max(0, res.reset - Date.now()),
    };
  } catch (err) {
    console.error(
      "[rate-limit] Upstash Redis call threw — falling back to in-memory (fail-closed):",
      err
    );
    return checkInMemoryRateLimit(identifier, customLimit);
  }
}

/** Legacy shape retained for any other existing caller. */
export const ratelimit = {
  async limit(identifier: string) {
    return checkRateLimit(identifier, 60);
  },
};