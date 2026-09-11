import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncSessionCookie } from "@/lib/supabase";

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient | undefined;
}

/**
 * Singleton factory for browser Supabase client.
 * Guarantees only ONE GoTrueClient / Supabase client instance exists in the browser context.
 */
export function createBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder_anon_key";

  if (typeof window === "undefined") {
    return createSsrBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  if (!globalThis.__supabaseBrowserClient) {
    const client = createSsrBrowserClient(supabaseUrl, supabaseAnonKey);
    globalThis.__supabaseBrowserClient = client;

    // Automatically sync auth state to cookie whenever session changes
    client.auth.onAuthStateChange((_event, session) => {
      syncSessionCookie(session);
    });

    // Safely check initial session on creation
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (data?.session && !error) {
          syncSessionCookie(data.session);
        } else if (error) {
          syncSessionCookie(null);
        }
      })
      .catch(() => {
        syncSessionCookie(null);
      });
  }

  return globalThis.__supabaseBrowserClient;
}

/** Alias for createBrowserClient */
export const createClient = createBrowserClient;

/** Exported singleton instance for direct import usage */
export const supabase = createBrowserClient();

export default supabase;

