import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Edge-compatible, self-contained rate limiter
//
// WHY HERE: Middleware runs before any route handler, so throttled requests
// are rejected without incurring Supabase DB calls inside the route.
//
// WHY NOT IMPORT lib/rate-limiter.ts: The middleware edge runtime cannot
// safely import Node.js-oriented modules; the logic is inlined (~30 lines).
//
// STRATEGY: Blanket 1,000 req/min cap per API key across ALL plans.
//   • This guards against floods at the edge without false-positives for
//     Pro users (Pro limit = 1,000 req/min — same as this cap).
//   • Per-plan granularity (Free = 60 req/min) is enforced accurately by
//     the route handlers, which have DB access to resolve the user's plan.
// ─────────────────────────────────────────────────────────────────────────────

/** Routes that are subject to API-key rate limiting */
const RATE_LIMITED_PATHS = ["/api/v1/ingest", "/api/v1/telemetry"];

/** Blanket edge cap — matches the Pro plan ceiling to avoid false-positives */
const EDGE_RATE_LIMIT = 1_000;
const WINDOW_MS = 60_000; // 1 minute

interface EdgeWindowEntry {
  count: number;
  windowStart: number; // epoch ms
}

/**
 * Module-level Map persists across requests within the same warm serverless
 * instance — the same technique used by lib/rate-limiter.ts.
 */
const edgeRateLimitStore = new Map<string, EdgeWindowEntry>();

function checkEdgeRateLimit(key: string): {
  allowed: boolean;
  current: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = edgeRateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // Fresh window
    edgeRateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, current: 1, retryAfterMs: 0 };
  }

  entry.count += 1;
  const retryAfterMs = WINDOW_MS - (now - entry.windowStart);

  if (entry.count > EDGE_RATE_LIMIT) {
    return { allowed: false, current: entry.count, retryAfterMs };
  }

  return { allowed: true, current: entry.count, retryAfterMs: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Edge Rate Limiting ────────────────────────────────────────────────────
  // Apply only to the ingestion / telemetry API routes.
  const isRateLimitedPath = RATE_LIMITED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isRateLimitedPath) {
    // Extract API key from x-api-key header or Authorization: Bearer <key>
    const xApiKey = request.headers.get("x-api-key");
    const authHeader = request.headers.get("authorization");

    let apiKey = "";
    if (xApiKey?.trim()) {
      apiKey = xApiKey.trim();
    } else if (authHeader?.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    }

    // Only rate-limit requests that carry an API key; unauthenticated
    // requests will be rejected by the route handler with 401.
    if (apiKey) {
      // Bucket by a truncated prefix of the key to avoid storing secrets
      // in memory in plain text while still uniquely identifying the caller.
      const keyBucket = `edge:${apiKey.substring(0, 16)}`;
      const result = checkEdgeRateLimit(keyBucket);

      if (!result.allowed) {
        const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
        const resetEpoch = Math.ceil((Date.now() + result.retryAfterMs) / 1000);

        console.warn(
          `[middleware] Edge rate limit exceeded path=${pathname} ` +
          `key_prefix=${apiKey.substring(0, 8)}… ` +
          `count=${result.current}/${EDGE_RATE_LIMIT}`
        );

        return NextResponse.json(
          { error: "Too Many Requests", message: "Rate limit exceeded." },
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Retry-After": String(retryAfterSec),
              "X-RateLimit-Limit": String(EDGE_RATE_LIMIT),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(resetEpoch),
            },
          }
        );
      }
    }
  }

  // ── Supabase Session Refresh ──────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder_anon_key";

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Prevent infinite redirect loops if already on login or signup pages
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  let user = null;
  try {
    // Refresh Supabase session by calling getUser() safely
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
    } else if (error) {
      // If user is non-existent or deleted, clear stale auth token cookies
      const sbCookie = request.cookies.getAll().find(
        (c) => (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) || c.name === "sb-auth-token"
      );
      if (sbCookie) {
        supabaseResponse.cookies.delete(sbCookie.name);
      }
    }
  } catch (err) {
    console.warn("Middleware auth verification error:", err);
    user = null;
  }

  // Allow access to auth pages without redirecting back to /login
  if (isAuthPage) {
    return supabaseResponse;
  }

  // Protect /dashboard routes — unauthenticated or deleted users are redirected to /login
  const isDashboardPath = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (isDashboardPath && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files & images.
     * Refreshes Supabase session for /dashboard and /api/* routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
