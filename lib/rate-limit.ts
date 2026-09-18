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

let redisClient: Redis | null = null;
let loggedEnvCheck = false;
const limiterCache = new Map<number, Ratelimit>();

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

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
      limiter: Ratelimit.slidingWindow(limit, "1 m"),
      analytics: true,
      prefix: `rate_limit:${limit}`,
    });
    limiterCache.set(limit, instance);
    return instance;
  } catch (err) {
    console.error(`[rate-limit] Failed to construct Ratelimit for limit=${limit}:`, err);
    return null;
  }
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = (redisUrl && redisToken)
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

export const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: true,
      prefix: "rate_limit:telemetry",
    })
  : null;

/**
 * Check and record one request against `identifier`'s sliding-window quota.
 */
export async function checkRateLimit(
  identifier: string,
  customLimit: number = 60
): Promise<RateLimitResult> {
  const hasEnvVars = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );

  const limiter = getUpstashLimiter(customLimit);

  if (limiter) {
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
      console.error("[rate-limit] Upstash Redis call threw error:", err);
      if (hasEnvVars) {
        // When env vars are active, DO NOT bypass Upstash Redis with in-memory fallback
        return {
          success: false,
          allowed: false,
          limit: customLimit,
          remaining: 0,
          current: customLimit,
          retryAfterMs: 60_000,
        };
      }
    }
  }

  // Only use in-memory rate limiting if Upstash Redis env vars are NOT configured
  if (!hasEnvVars) {
    return checkInMemoryRateLimit(identifier, customLimit);
  }

  return {
    success: false,
    allowed: false,
    limit: customLimit,
    remaining: 0,
    current: customLimit,
    retryAfterMs: 60_000,
  };
}

/** Legacy export */
export const legacyRatelimit = {
  async limit(identifier: string) {
    return checkRateLimit(identifier, 60);
  },
};