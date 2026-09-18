import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const WINDOW_MS = 60_000; // 1 minute
const DEFAULT_LIMIT = 60; // 60 requests per minute

export interface RateLimitResult {
  allowed: boolean;
  /** Requests used in the current window */
  current: number;
  /** Requests allowed per window */
  limit: number;
  /** Milliseconds until the window resets */
  retryAfterMs: number;
}

// ── In-Memory Sliding Window Store ───────────────────────────────────────────
interface WindowEntry {
  timestamps: number[];
}

const memoryStore = new Map<string, WindowEntry>();

function pruneMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < WINDOW_MS);
    if (entry.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}

/**
 * In-memory sliding window rate limiter fallback.
 * Strictly enforces rate limit of 60 requests per minute.
 */
export function checkInMemoryRateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = WINDOW_MS
): RateLimitResult {
  try {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = memoryStore.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      memoryStore.set(identifier, entry);
    }

    // Retain timestamps within the sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    const currentCount = entry.timestamps.length + 1;

    if (currentCount > limit) {
      const oldestTs = entry.timestamps[0] || now;
      const retryAfterMs = Math.max(0, oldestTs + windowMs - now);
      return {
        allowed: false,
        current: currentCount,
        limit,
        retryAfterMs,
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      current: currentCount,
      limit,
      retryAfterMs: 0,
    };
  } catch (err) {
    console.error("[rate-limit] In-memory rate limiter error:", err);
    // FAIL CLOSED: if in-memory limiter fails unexpectedly, deny request
    return {
      allowed: false,
      current: limit + 1,
      limit,
      retryAfterMs: windowMs,
    };
  }
}

// ── Upstash Redis Client ──────────────────────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let redis: Redis | null = null;
let ratelimiterMap = new Map<number, Ratelimit>();

if (redisUrl && redisToken) {
  try {
    redis = new Redis({ url: redisUrl, token: redisToken });
  } catch (err) {
    console.warn("[rate-limit] Failed to initialize Upstash Redis client:", err);
    redis = null;
  }
}

function getUpstashRatelimiter(limit: number): Ratelimit | null {
  if (!redis) return null;
  if (!ratelimiterMap.has(limit)) {
    try {
      ratelimiterMap.set(
        limit,
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(limit, "60 s"),
          analytics: true,
          prefix: "@upstash/ratelimit",
        })
      );
    } catch (err) {
      console.warn("[rate-limit] Failed to create Upstash Ratelimit instance:", err);
      return null;
    }
  }
  return ratelimiterMap.get(limit) || null;
}

/**
 * Check rate limit enforcing Fail-Closed policy.
 * If Upstash Redis fails or is not configured, fallbacks to in-memory sliding window.
 * If fallback fails, strictly denies request (fail-closed).
 *
 * @param identifier - API key string or IP address
 * @param limit - Maximum allowed requests within window (default 60)
 * @param windowMs - Sliding window duration in milliseconds (default 60000 ms)
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = WINDOW_MS
): Promise<RateLimitResult> {
  if (Math.random() < 0.1) {
    pruneMemoryStore();
  }

  const ratelimiter = getUpstashRatelimiter(limit);

  if (ratelimiter) {
    try {
      const res = await ratelimiter.limit(identifier);
      const retryAfterMs = Math.max(0, res.reset - Date.now());
      return {
        allowed: res.success,
        current: limit - res.remaining,
        limit,
        retryAfterMs,
      };
    } catch (err) {
      console.warn(
        "[rate-limit] Upstash Redis check failed, falling back to in-memory sliding window:",
        err
      );
      return checkInMemoryRateLimit(identifier, limit, windowMs);
    }
  }

  try {
    return checkInMemoryRateLimit(identifier, limit, windowMs);
  } catch (err) {
    console.error("[rate-limit] Rate limit check exception:", err);
    // FAIL CLOSED
    return {
      allowed: false,
      current: limit + 1,
      limit,
      retryAfterMs: windowMs,
    };
  }
}
