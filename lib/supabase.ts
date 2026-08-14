import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_service_key';

if (!supabaseUrl) {
  console.warn("AgentMeter Warning: NEXT_PUBLIC_SUPABASE_URL is missing.");
}

// Global declaration for singleton caching in browser context
declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __supabaseAdminClient: SupabaseClient | undefined;
}

/**
 * Synchronizes the Supabase session token to browser document.cookie
 * so Next.js edge middleware can validate authentication without localStorage access.
 */
export function syncSessionCookie(session: any) {
  if (typeof window === "undefined") return;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const match = url.match(/https?:\/\/([^.]+)\./);
    const ref = match?.[1] ?? "";
    const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";

    if (session?.access_token) {
      const cookieVal = encodeURIComponent(JSON.stringify(session));
      const maxAge = session.expires_in || 604800;
      document.cookie = `${cookieName}=${cookieVal}; path=/; max-age=${maxAge}; SameSite=Lax`;
    } else {
      document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch (e) {
    console.warn("Error syncing session cookie:", e);
  }
}

/**
 * Singleton factory for browser Supabase client.
 * Guarantees only ONE GoTrueClient / Supabase client instance exists in the browser session.
 */
export function createBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    return createSupabaseClient(supabaseUrl, supabaseAnonKey);
  }

  if (!globalThis.__supabaseBrowserClient) {
    const client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    globalThis.__supabaseBrowserClient = client;

    // Automatically sync auth state to cookie whenever session changes
    client.auth.onAuthStateChange((_event, session) => {
      syncSessionCookie(session);
    });

    // Sync initial session on creation if available
    client.auth.getSession().then(({ data }) => {
      if (data.session) {
        syncSessionCookie(data.session);
      }
    });
  }

  return globalThis.__supabaseBrowserClient;
}

/** Alias for createBrowserClient */
export const createClient = createBrowserClient;

/**
 * Exported singleton instance for direct import usage:
 * `import { supabase } from "@/lib/supabase"`
 */
export const supabase = createBrowserClient();

/**
 * Server-side Service Role Admin instance (bypasses RLS for telemetry ingestion & key validation)
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

export const supabaseAdmin = getSupabaseAdminClient();


