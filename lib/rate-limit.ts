import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Strict In-Memory Sliding Window Fallback (60 req per 1 min)
const memoryStore = new Map<string, number[]>();

function checkInMemoryLimit(identifier: string): { success: boolean; limit: number; remaining: number; reset: number } {
  try {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const limit = 60;

    const timestamps = (memoryStore.get(identifier) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: now + windowMs,
      };
    }

    timestamps.push(now);
    memoryStore.set(identifier, timestamps);

    return {
      success: true,
      limit,
      remaining: limit - timestamps.length,
      reset: now + windowMs,
    };
  } catch (err) {
    console.error("[rate-limit] In-memory rate limit error:", err);
    // DO NOT default to allowing the request -> FAIL CLOSED
    return {
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60000,
    };
  }
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
  identifier: string
): Promise<{ allowed: boolean; current: number; limit: number; retryAfterMs: number }> {
  const res = await ratelimit.limit(identifier);
  return {
    allowed: res.success,
    current: (res.limit ?? 60) - (res.remaining ?? 0),
    limit: res.limit ?? 60,
    retryAfterMs: Math.max(0, (res.reset ?? Date.now() + 60000) - Date.now()),
  };
}
