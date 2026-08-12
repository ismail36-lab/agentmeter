import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl) {
  console.warn("AgentMeter Warning: NEXT_PUBLIC_SUPABASE_URL is missing.");
}

// Client-side / Standard Supabase instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Service Role Admin instance (bypasses RLS for telemetry ingestion & key validation)
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey || supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
