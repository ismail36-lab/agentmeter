import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export interface AuthenticatedApiKey {
  id: string;
  name: string;
  user_id: string;
  is_active: boolean;
  status?: string;
  budget_cap_usd?: number | null;
  current_period_spend_usd?: number | null;
  budget_action?: string | null;
}

export interface VerifyApiKeyResult {
  success: boolean;
  apiKeyRecord?: AuthenticatedApiKey | null;
  userId?: string | null;
  error?: string;
}

/**
 * Validates an incoming raw API key against Supabase api_keys table.
 * Computes SHA-256 hash of raw key and queries api_keys where key_hash = computed_hash and is_active = true.
 */
export async function verifyApiKey(rawKey: string): Promise<VerifyApiKeyResult> {
  const cleanKey = (rawKey || "").replace(/^["']|["']$/g, "").trim();

  if (!cleanKey) {
    console.log("[telemetry-auth] Verification failed: Missing API Key");
    return { success: false, error: "Unauthorized: Missing API Key" };
  }

  if (cleanKey.includes("...")) {
    console.log("[telemetry-auth] Verification failed: Truncated masked placeholder received");
    return {
      success: false,
      error: "Unauthorized: Invalid API Key — received a masked placeholder instead of the full secret key.",
    };
  }

  // Calculate SHA-256 hash from incoming raw key
  const computedHash = crypto.createHash("sha256").update(cleanKey).digest("hex");
  const prefix = cleanKey.slice(0, 12);

  // Debug log statements as requested
  console.log(`[telemetry-auth] Incoming raw key prefix: ${prefix}...`);
  console.log(`[telemetry-auth] Calculated SHA-256 hash: ${computedHash}`);

  // Database lookup: SELECT * FROM api_keys WHERE key_hash = <computed_hash> AND is_active = true
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, user_id, is_active, status, budget_cap_usd, current_period_spend_usd, budget_action")
    .eq("key_hash", computedHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn(`[telemetry-auth] DB lookup query error: ${error.message}`);
    return { success: false, error: "Unauthorized: Key validation database error" };
  }

  if (!data) {
    console.log(`[telemetry-auth] Match result: NOT FOUND in DB (key_hash: ${computedHash})`);
    return { success: false, error: "Unauthorized: Invalid API Key" };
  }

  console.log(`[telemetry-auth] Match result: SUCCESSFUL MATCH FOUND for key ID ${data.id} (user: ${data.user_id})`);

  return {
    success: true,
    apiKeyRecord: data,
    userId: data.user_id ?? null,
  };
}
