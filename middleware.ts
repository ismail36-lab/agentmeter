import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder_anon_key";

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
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

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
