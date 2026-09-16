/**
 * Browser-safe barrel re-export.
 *
 * Re-exports ONLY client-safe symbols so any component or page can do:
 *   import { supabase, syncSessionCookie } from "@/lib/supabase"
 *
 * Server-side/admin symbols (supabaseAdmin, getSupabaseAdminClient, getUserFromRequest)
 * have been moved to "@/lib/supabase/admin" which is guarded by `import "server-only"`.
 * API routes and server actions import directly from there.
 *
 * Do NOT add admin/service-role imports here — this file is intentionally client-safe.
 */

export {
  syncSessionCookie,
  createBrowserClient,
  createClient,
  supabase,
} from "./supabase/client";
