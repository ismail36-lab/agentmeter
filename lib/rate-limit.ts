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

// Strict In-Memory Sliding Window Fallback (default 60 req per 1 min)
const memoryStore = new Map<string, number[]>();

export function checkInMemoryRateLimit(
  identifier: string,
  maxLimit: number = 60
): RateLimitResult {
  try {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const limit = maxLimit;

    const timestamps = (memoryStore.get(identifier) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      return {
        success: false,
        allowed: false,
        limit,
        remaining: 0,
        current: timestamps.length,
        retryAfterMs: Math.max(0, (timestamps[0] || now) + windowMs - now),
      };
    }

    timestamps.push(now);
    memoryStore.set(identifier, timestamps);

    const remaining = limit - timestamps.length;
    return {
      success: true,
      allowed: true,
      limit,
      remaining,
      current: timestamps.length,
      retryAfterMs: 0,
    };
  } catch (err) {
    console.error("[rate-limit] In-memory rate limit error:", err);
    // DO NOT default to allowing the request -> FAIL CLOSED
    return {
      success: false,
      allowed: false,
      limit: maxLimit,
      remaining: 0,
      current: maxLimit,
      retryAfterMs: 60000,
    };
  }
}

function checkInMemoryLimit(identifier: string, maxLimit = 60): { success: boolean; limit: number; remaining: number; reset: number } {
  const res = checkInMemoryRateLimit(identifier, maxLimit);
  return {
    success: res.allowed,
    limit: res.limit,
    remaining: res.remaining,
    reset: Date.now() + res.retryAfterMs,
  };
}

let redisClient: Redis | null = null;
let upstashLimiter: Ratelimit | null = null;

function getUpstashLimiter(): Ratelimit | null {
  if (upstashLimiter) return upstashLimiter;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken) {
    try {
      redisClient = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      upstashLimiter = new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(60, "60 s"),
        analytics: true,
        prefix: "rate_limit",
      });
      return upstashLimiter;
    } catch (err) {
      console.error("[rate-limit] Failed to initialize Upstash Redis:", err);
      redisClient = null;
      upstashLimiter = null;
      return null;
    }
  }
  return null;
}

export const ratelimit = {
  async limit(identifier: string): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number }> {
    const limiter = getUpstashLimiter();
    if (limiter) {
      try {
        const res = await limiter.limit(identifier);
        return {
          success: res.success,
          limit: res.limit,
          remaining: res.remaining,
          reset: res.reset,
        };
      } catch (err) {
        console.error("[rate-limit] Upstash Redis request failed, using strict memory fallback:", err);
        return checkInMemoryLimit(identifier);
      }
    }

    return checkInMemoryLimit(identifier);
  },
};

export async function checkRateLimit(
  identifier: string,
  customLimit: number = 60
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter();
  if (limiter) {
    try {
      const res = await limiter.limit(identifier);
      const limit = customLimit ?? res.limit ?? 60;
      const remaining = Math.max(0, res.remaining ?? 0);
      const success = res.success && remaining >= 0;
      const current = (res.limit ?? 60) - remaining;

      return {
        success,
        allowed: success,
        limit,
        remaining,
        current,
        retryAfterMs: Math.max(0, (res.reset ?? Date.now() + 60000) - Date.now()),
      };
    } catch (err) {
      console.error("[rate-limit] Upstash Redis rate limit check failed, using memory fallback:", err);
      return checkInMemoryRateLimit(identifier, customLimit);
    }
  }

  return checkInMemoryRateLimit(identifier, customLimit);
}
