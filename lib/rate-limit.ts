import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterMs: number;
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

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
        allowed: false,
        current: timestamps.length,
        limit,
        retryAfterMs: Math.max(0, (timestamps[0] || now) + windowMs - now),
      };
    }

    timestamps.push(now);
    memoryStore.set(identifier, timestamps);

    return {
      allowed: true,
      current: timestamps.length,
      limit,
      retryAfterMs: 0,
    };
  } catch (err) {
    console.error("[rate-limit] In-memory rate limit error:", err);
    // DO NOT default to allowing the request -> FAIL CLOSED
    return {
      allowed: false,
      current: maxLimit,
      limit: maxLimit,
      retryAfterMs: 60000,
    };
  }
}

function checkInMemoryLimit(identifier: string, maxLimit = 60): { success: boolean; limit: number; remaining: number; reset: number } {
  const res = checkInMemoryRateLimit(identifier, maxLimit);
  return {
    success: res.allowed,
    limit: res.limit,
    remaining: Math.max(0, res.limit - res.current),
    reset: Date.now() + res.retryAfterMs,
  };
}

let redisClient: Redis | null = null;
let upstashLimiter: Ratelimit | null = null;

if (redisUrl && redisToken) {
  try {
    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    upstashLimiter = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: true,
      prefix: "@upstash/ratelimit",
    });
  } catch (err) {
    console.warn("[rate-limit] Failed to initialize Upstash Redis:", err);
    redisClient = null;
    upstashLimiter = null;
  }
}

export const ratelimit = {
  async limit(identifier: string): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number }> {
    if (upstashLimiter) {
      try {
        const res = await upstashLimiter.limit(identifier);
        return {
          success: res.success,
          limit: res.limit,
          remaining: res.remaining,
          reset: res.reset,
        };
      } catch (err) {
        console.warn("[rate-limit] Upstash Redis request failed, using strict memory fallback:", err);
        // Fallback to strict in-memory sliding window -> DO NOT default to allowing request
        return checkInMemoryLimit(identifier);
      }
    }

    // If env vars are missing or Redis fails, fallback to strict memory limiter -> DO NOT default to allowing request
    return checkInMemoryLimit(identifier);
  },
};

export async function checkRateLimit(
  identifier: string,
  customLimit?: number
): Promise<RateLimitResult> {
  if (upstashLimiter) {
    try {
      const res = await upstashLimiter.limit(identifier);
      const limit = customLimit ?? res.limit ?? 60;
      const current = (res.limit ?? 60) - (res.remaining ?? 0);
      const allowed = res.success && (customLimit === undefined || current <= customLimit);
      return {
        allowed,
        current,
        limit,
        retryAfterMs: Math.max(0, (res.reset ?? Date.now() + 60000) - Date.now()),
      };
    } catch (err) {
      console.warn("[rate-limit] Upstash Redis request failed, using strict memory fallback:", err);
      return checkInMemoryRateLimit(identifier, customLimit);
    }
  }

  return checkInMemoryRateLimit(identifier, customLimit);
}
