import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protected routes — unauthenticated users are redirected to /login.
 *
 * Supabase (supabase-js v2, no @supabase/ssr) stores the session as a
 * JSON-encoded string in `sb-<ref>-auth-token` inside localStorage on the
 * browser. Because middleware runs on the edge (no localStorage), we check
 * for the Supabase auth cookie that the browser sends as a header.
 *
 * When `@supabase/supabase-js` v2 is used with `persistSession: true`
 * (the default), it writes the session to a cookie named:
 *   sb-<project-ref>-auth-token
 *
 * We derive the project ref from NEXT_PUBLIC_SUPABASE_URL and look for
 * that cookie. A valid JSON payload with an `access_token` field means
 * the user is authenticated.
 */

const PROTECTED_PATHS = ["/dashboard"];

function getProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // e.g. https://kxtpromzjuaeftmljaar.supabase.co  →  kxtpromzjuaeftmljaar
  const match = url.match(/https?:\/\/([^.]+)\./);
  return match?.[1] ?? "";
}

function isAuthenticated(request: NextRequest): boolean {
  const ref = getProjectRef();
  // Supabase v2 cookie name pattern
  const cookieName = `sb-${ref}-auth-token`;
  const cookie = request.cookies.get(cookieName)?.value;

  if (!cookie) return false;

  try {
    // The cookie value is a URL-encoded JSON string
    const decoded = decodeURIComponent(cookie);
    const parsed = JSON.parse(decoded);
    // Accept both array format and plain object format
    const session = Array.isArray(parsed) ? parsed[0] : parsed;
    return Boolean(session?.access_token);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (isProtected && !isAuthenticated(request)) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the original destination so we can redirect after login
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image  (image optimisation)
     * - favicon.ico
     * - api routes (they handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
