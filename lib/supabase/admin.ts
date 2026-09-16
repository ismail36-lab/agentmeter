// This import prevents this module from ever being bundled into a browser/client component.
// Next.js will throw a build error if any Client Component (or anything they import)
// pulls in this file — ensuring SUPABASE_SERVICE_ROLE_KEY never leaks to the browser.
import "server-only";

import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder_anon_key";
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder_service_key";

// Global singleton cache (server/edge context)
declare global {
  // eslint-disable-next-line no-var
  var __supabaseAdminClient: SupabaseClient | undefined;
}

/**
 * Server-side Service Role Admin instance.
 * Bypasses RLS — only use in trusted server-side code (API routes, server actions, cron jobs).
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!globalThis.__supabaseAdminClient) {
    globalThis.__supabaseAdminClient = createSupabaseClient(
      supabaseUrl,
      supabaseServiceRoleKey || supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return globalThis.__supabaseAdminClient;
}

/** Exported singleton for direct import usage: `import { supabaseAdmin } from "@/lib/supabase"` */
export const supabaseAdmin = getSupabaseAdminClient();

/**
 * Extract authenticated user from a NextRequest (Authorization header or Supabase session cookies).
 * Uses the admin client to validate tokens server-side.
 */
export async function getUserFromRequest(
  req: NextRequest
): Promise<{ id: string; email: string } | null> {
  const adminClient = getSupabaseAdminClient();

  // 1. Try Authorization header: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const { data } = await adminClient.auth.getUser(token);
        if (data?.user) return { id: data.user.id, email: data.user.email ?? "" };
      } catch (e) {
        console.warn("Error resolving user from Authorization token:", e);
      }
    }
  }

  // 2. Try Next.js request cookies
  const allCookies = req.cookies.getAll();
  const sbCookie = allCookies.find(
    (c) =>
      (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) ||
      c.name === "sb-auth-token"
  );

  if (sbCookie?.value) {
    try {
      let rawVal = sbCookie.value;
      if (rawVal.startsWith("%")) {
        rawVal = decodeURIComponent(rawVal);
      }
      const parsed = JSON.parse(rawVal);
      const session = Array.isArray(parsed) ? parsed[0] : parsed;

      const accessToken = session?.access_token;
      if (accessToken) {
        try {
          const { data } = await adminClient.auth.getUser(accessToken);
          if (data?.user) {
            return { id: data.user.id, email: data.user.email ?? "" };
          }
        } catch {}
      }

      if (session?.user?.id) {
        return { id: session.user.id, email: session.user.email ?? "" };
      }
    } catch (err) {
      console.warn("Error parsing auth cookie:", err);
    }
  }

  // 3. Fallback: Parse raw Cookie header string
  const rawCookieHeader = req.headers.get("cookie") || "";
  if (rawCookieHeader) {
    const matches = rawCookieHeader.match(/sb-[^=]*auth-token=([^;]+)/);
    if (matches?.[1]) {
      try {
        let rawVal = matches[1];
        if (rawVal.startsWith("%")) {
          rawVal = decodeURIComponent(rawVal);
        }
        const parsed = JSON.parse(rawVal);
        const session = Array.isArray(parsed) ? parsed[0] : parsed;
        if (session?.user?.id) {
          return { id: session.user.id, email: session.user.email ?? "" };
        }
      } catch {}
    }
  }

  return null;
}
