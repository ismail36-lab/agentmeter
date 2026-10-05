import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { verifyApiKey } from "@/lib/auth/meterix";
import { checkRateLimitAsync } from "@/lib/rate-limiter";
import { checkMonthlyQuota } from "@/lib/quota";
import { getCacheReadMultiplier } from "@/lib/pricing";

export async function resolveIngestionAuth(
  xApiKey: string | null,
  authHeader: string | null,
  requestedKeyIdHeader: string | null
) {
  let apiKey = "";
  if (xApiKey && xApiKey.trim()) apiKey = xApiKey.trim();
  else if (authHeader && authHeader.startsWith("Bearer ")) apiKey = authHeader.substring(7).trim();
  else if (authHeader && authHeader !== "anonymous") apiKey = authHeader.trim();

  apiKey = apiKey.replace(/^["']|["']$/g, "").trim();

  let userId: string | null = null;
  let apiKeyRecord: any = null;

  if (apiKey) {
    const authResult = await verifyApiKey(apiKey);
    if (authResult.success && authResult.apiKeyRecord) {
      apiKeyRecord = authResult.apiKeyRecord;
      userId = authResult.userId ?? null;
    }
  }

  let requestedKeyId: string | null = requestedKeyIdHeader;

  if (!apiKeyRecord) {
    try {
      const supabase = createClient();
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (sessionUser) userId = sessionUser.id;
    } catch (err) {}

    if (!userId && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && !token.startsWith("mx_")) {
        const { data: { user: jwtUser } } = await supabaseAdmin.auth.getUser(token);
        if (jwtUser) userId = jwtUser.id;
      }
    }

    if (userId) {
      if (requestedKeyId) {
        const { data: foundKey } = await supabaseAdmin
          .from("api_keys")
          .select("*")
          .eq("id", requestedKeyId)
          .eq("user_id", userId)
          .maybeSingle();
        if (foundKey) apiKeyRecord = foundKey;
      }
      if (!apiKeyRecord) {
        const { data: primaryKey } = await supabaseAdmin
          .from("api_keys")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (primaryKey) apiKeyRecord = primaryKey;
        else {
          apiKeyRecord = {
            id: requestedKeyId || `internal-tester:${userId}`,
            user_id: userId,
            name: "Dashboard Tester",
            is_active: true,
          };
        }
      }
    }
  }

  let userPlan = "free";
  if (userId) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.plan) userPlan = String(profile.plan).toLowerCase();
    } catch (err) {}
  }

  return { userId, apiKeyRecord, userPlan };
}

export async function enforceIngestionGuardrails(
  userId: string,
  apiKeyRecord: any,
  userPlan: string
) {
  const rateLimitIdentifier = `telemetry:${apiKeyRecord?.id || userId}`;
  const rateLimitResult = await checkRateLimitAsync(rateLimitIdentifier, userPlan);
  if (!rateLimitResult.allowed) return { error: "rate_limit", rateLimitResult };

  const quotaCheck = await checkMonthlyQuota(userId, userPlan);
  if (!quotaCheck.allowed) return { error: "quota", quotaCheck };

  const currentSpend = Number(apiKeyRecord?.current_period_spend_usd ?? 0);
  const budgetCap = apiKeyRecord?.budget_cap_usd !== null && apiKeyRecord?.budget_cap_usd !== undefined
    ? Number(apiKeyRecord.budget_cap_usd)
    : null;
  const action = String(apiKeyRecord?.budget_action || apiKeyRecord?.budget_cap_action || "block_new_logs").toLowerCase();

  if (budgetCap !== null && budgetCap > 0 && currentSpend >= budgetCap) {
    if (action === "block_new_logs" || action === "revoke_key") {
      return { error: "budget_exceeded", action, budgetCap, currentSpend };
    }
  }

  return { error: null };
}

export function calculateIngestionCost(
  pTokens: number,
  cTokens: number,
  cachedTokens: number,
  cacheCreationTokens: number,
  provider: string,
  modelKey: string,
  pricingCache: any[]
) {
  let roundedCost = 0;
  let cacheSavingsUSD = 0;
  let isEstimated = false;
  let warning: string | undefined;

  const foundPricing = pricingCache.find(
    (p) =>
      p.model_name === modelKey &&
      p.provider.toLowerCase() === provider.toLowerCase()
  );

  const fallbackPricing = pricingCache.find(
    (p) => p.model_name === modelKey
  );

  if (foundPricing) {
    const inputRate = foundPricing.input_price_per_million / 1_000_000;
    const outputRate = foundPricing.output_price_per_million / 1_000_000;
    const cacheReadMultiplier = getCacheReadMultiplier(provider, modelKey);
    const cacheReadRate = inputRate * cacheReadMultiplier;
    const cacheWriteRate = inputRate * 1.25;

    const safeCached = Math.max(0, cachedTokens);
    const safeCreation = Math.max(0, cacheCreationTokens);
    const regularTokens = Math.max(0, pTokens - safeCached - safeCreation);

    const calculatedCost =
      (regularTokens * inputRate) +
      (safeCached * cacheReadRate) +
      (safeCreation * cacheWriteRate) +
      (cTokens * outputRate);

    roundedCost = Number(calculatedCost.toFixed(6));
    cacheSavingsUSD = Number((safeCached * (inputRate - cacheReadRate)).toFixed(6));
  } else if (fallbackPricing) {
    isEstimated = true;
    warning = "model deprecated or unrecognized, cost is an estimate";
    const inputRate = fallbackPricing.input_price_per_million / 1_000_000;
    const outputRate = fallbackPricing.output_price_per_million / 1_000_000;
    const cacheReadMultiplier = getCacheReadMultiplier(provider, modelKey);
    const cacheReadRate = inputRate * cacheReadMultiplier;
    const cacheWriteRate = inputRate * 1.25;

    const safeCached = Math.max(0, cachedTokens);
    const safeCreation = Math.max(0, cacheCreationTokens);
    const regularTokens = Math.max(0, pTokens - safeCached - safeCreation);

    const calculatedCost =
      (regularTokens * inputRate) +
      (safeCached * cacheReadRate) +
      (safeCreation * cacheWriteRate) +
      (cTokens * outputRate);

    roundedCost = Number(calculatedCost.toFixed(6));
    cacheSavingsUSD = Number((safeCached * (inputRate - cacheReadRate)).toFixed(6));
  } else {
    isEstimated = true;
    warning = "model deprecated or unrecognized, cost is an estimate";
    const defaultInputCostPerToken = 1.0 / 1_000_000;
    const defaultOutputCostPerToken = 3.0 / 1_000_000;
    const calculatedCost = pTokens * defaultInputCostPerToken + cTokens * defaultOutputCostPerToken;
    roundedCost = Number(calculatedCost.toFixed(6));
  }

  return { roundedCost, cacheSavingsUSD, isEstimated, warning, finalProvider: provider };
}

export async function applyBudgetCharge(apiKeyRecordId: string, roundedCost: number) {
  try {
    const { error: rpcErr } = await supabaseAdmin.rpc("increment_key_spend", {
      key_id: apiKeyRecordId,
      amount: roundedCost,
    });
    if (rpcErr) {
      console.warn("[ingestion-core] increment_key_spend RPC error:", rpcErr.message);
    }
  } catch (rpcErr) {
    console.warn("[ingestion-core] increment_key_spend RPC exception:", rpcErr);
  }
}
