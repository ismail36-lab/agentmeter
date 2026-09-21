import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dispatchWebhookAlert } from "@/lib/webhooks";
import { verifyApiKey } from "@/lib/auth/meterix";
import { createClient } from "@/utils/supabase/server";
import { getCacheReadMultiplier } from "@/lib/pricing";
import crypto from "crypto";
import { sendBudgetAlert } from "@/lib/budget-alerts";
import { sendAnomalyAlert } from "@/lib/anomaly-alerts";
import { checkRateLimitAsync } from "@/lib/rate-limiter";
import { checkMonthlyQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

async function getOwnerEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    return userData?.user?.email || null;
  } catch (e) {
    return null;
  }
}

/** Shape returned by the model_pricing table */
type ModelPricingRow = {
  model: string;
  provider: string;
  input_price_per_million: number;
  output_price_per_million: number;
  is_active: boolean;
};

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-internal-test, x-key-id, x-idempotency-key, idempotency-key",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(req: NextRequest) {
  // ── 1. Extract Bearer token / API Key & Idempotency Key from request headers ──
  const xApiKey = req.headers.get("x-api-key");
  const authHeader = req.headers.get("authorization");
  const headerIdempotencyKey = req.headers.get("x-idempotency-key") || req.headers.get("idempotency-key");

  let apiKey = "";
  if (xApiKey && xApiKey.trim()) {
    apiKey = xApiKey.trim();
  } else if (authHeader && authHeader.startsWith("Bearer ")) {
    apiKey = authHeader.substring(7).trim();
  } else if (authHeader && authHeader !== "anonymous") {
    apiKey = authHeader.trim();
  }

  // Strip any accidental wrapping quotes
  apiKey = apiKey.replace(/^["']|["']$/g, "").trim();

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const requestedKeyIdHeader = req.headers.get("x-key-id");

  // ── 2. Resolve identity + plan BEFORE rate limiting check ──────────────────
  let userId: string | null = null;
  let apiKeyRecord: any = null;

  if (apiKey) {
    const authResult = await verifyApiKey(apiKey);
    if (authResult.success && authResult.apiKeyRecord) {
      apiKeyRecord = authResult.apiKeyRecord;
      userId = authResult.userId ?? null;
    }
  }

  let requestedKeyId: string | null = null;

  if (!apiKeyRecord) {
    // Try resolving active user session via cookies
    try {
      const supabase = createClient();
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (sessionUser) {
        userId = sessionUser.id;
      }
    } catch (err) {
      console.warn("[telemetry-auth] Notice reading session cookies:", err);
    }

    // Try resolving Bearer token as a Supabase JWT if cookie didn't yield a user
    if (!userId && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && !token.startsWith("mx_")) {
        const { data: { user: jwtUser } } = await supabaseAdmin.auth.getUser(token);
        if (jwtUser) {
          userId = jwtUser.id;
        }
      }
    }

    if (userId) {
      // key_id may arrive via header or (once we parse it below) via body;
      // the header covers the common dashboard-tester case cheaply.
      requestedKeyId = requestedKeyIdHeader;

      if (requestedKeyId) {
        const { data: foundKey } = await supabaseAdmin
          .from("api_keys")
          .select("*")
          .eq("id", requestedKeyId)
          .eq("user_id", userId)
          .maybeSingle();
        if (foundKey) {
          apiKeyRecord = foundKey;
        }
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

        if (primaryKey) {
          apiKeyRecord = primaryKey;
        } else {
          // Fallback synthetic key if user has no keys in DB yet
          apiKeyRecord = {
            id: requestedKeyId || "internal-tester",
            user_id: userId,
            name: "Dashboard Tester",
            is_active: true,
          };
        }
      }
    }
  }

  // Require valid authentication
  if (!apiKeyRecord || !userId) {
    console.log("[telemetry-auth] Authentication FAILED: Invalid API Key and no active user session found");
    return NextResponse.json(
      { error: "Secret key missing or invalid, and no active user session found" },
      { status: 401, headers: getCorsHeaders() }
    );
  }

  // Resolve plan from public.profiles (single source of truth)
  let userPlan = "free";
  if (userId) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.plan) {
        userPlan = String(profile.plan).toLowerCase();
      }
    } catch (err) {
      console.warn("[telemetry-auth] Could not fetch plan:", err);
    }
  }

  // ── 3. Post-Authentication Plan-Based Rate Limit Check ──────────────────────
  const rateLimitIdentifier = `telemetry:${apiKeyRecord.id || userId}`;
  const rateLimitResult = await checkRateLimitAsync(rateLimitIdentifier, userPlan);

  if (!rateLimitResult.allowed) {
    const retryAfterSec = Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000);
    return NextResponse.json(
      { error: "Too Many Requests", message: "Rate limit exceeded." },
      {
        status: 429,
        headers: {
          ...getCorsHeaders(),
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": String(Math.max(0, rateLimitResult.remaining)),
          "X-RateLimit-Reset": String(Math.ceil((Date.now() + (rateLimitResult.retryAfterMs || 60000)) / 1000)),
        },
      }
    );
  }

  try {
    // 5. Parse JSON Body
    const body = await req.json().catch(() => ({}));
    // requestedKeyId from the body is honored for the dashboard tester flow,
    // matching the original behavior (header already checked above).
    if (!requestedKeyId) {
      requestedKeyId = body.key_id || body.keyId || null;
    }

    const idempotencyKey = String(
      headerIdempotencyKey || body.idempotency_key || body.idempotencyKey || body.idempotency || ""
    ).trim() || null;

    // 5b. Idempotency Check — return existing log response if key was already ingested
    if (idempotencyKey) {
      try {
        const { data: existingLog } = await supabaseAdmin
          .from("usage_logs")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existingLog) {
          const logCost = Number(existingLog.total_cost_usd ?? existingLog.cost_usd ?? existingLog.cost ?? 0);
          const pToks = Number(existingLog.input_tokens || 0);
          const cToks = Number(existingLog.output_tokens || 0);

          return NextResponse.json(
            {
              success: true,
              idempotent_replay: true,
              log_id: existingLog.id,
              model: existingLog.model || "gpt-4o",
              prompt_tokens: pToks,
              completion_tokens: cToks,
              cached_tokens: Number(existingLog.cached_tokens || 0),
              cache_creation_tokens: Number(existingLog.cache_creation_tokens || 0),
              total_tokens: pToks + cToks,
              calculated_cost: logCost,
              total_cost_usd: logCost,
              cache_savings_usd: Number(existingLog.cache_savings_usd || 0),
              is_estimated: Boolean(existingLog.is_estimated ?? false),
              environment: existingLog.environment || "production",
              agent_name: existingLog.agent_name || "default-agent",
              ...(existingLog.session_id && { session_id: existingLog.session_id }),
              currency: "USD",
              timestamp: existingLog.created_at || new Date().toISOString(),
            },
            { status: 200, headers: getCorsHeaders() }
          );
        }
      } catch (err) {
        console.warn("[idempotency-check] Pre-ingest query notice:", err);
      }
    }

    // 5a. Monthly Quota Limit Enforcement — uses shared checkMonthlyQuota utility
    const quotaResult = await checkMonthlyQuota(userId, userPlan);
    if (!quotaResult.allowed) {
      return NextResponse.json(
        {
          error: "Monthly log limit reached",
          message: `Monthly limit of ${quotaResult.monthlyLimit.toLocaleString()} logs reached for ${userPlan} plan. Resets at the start of next month.`,
          plan: userPlan,
          usage: quotaResult.currentCount,
          limit: quotaResult.monthlyLimit,
        },
        { status: 429, headers: getCorsHeaders() }
      );
    }

    // 6. Extract JSON Body fields
    const { model, prompt_tokens, completion_tokens, input_tokens, output_tokens, metadata } = body;

    const pTokens = Number(prompt_tokens ?? input_tokens ?? 0);
    const cTokens = Number(completion_tokens ?? output_tokens ?? 0);

    // Parse Prompt Caching fields
    const cachedTokens = Number(
      body.cached_tokens ??
      body.cache_read_tokens ??
      body.cache_read_input_tokens ??
      metadata?.cached_tokens ??
      metadata?.cache_read_tokens ??
      0
    );
    const cacheCreationTokens = Number(
      body.cache_creation_tokens ??
      body.cache_creation_input_tokens ??
      metadata?.cache_creation_tokens ??
      0
    );

    // Parse Metadata breakdown fields
    const envTag = String(
      metadata?.environment ?? body.environment ?? body.env ?? "production"
    ).toLowerCase();
    const agentTag = String(
      metadata?.agent_name ?? body.agent_name ?? body.agent ?? "default-agent"
    );
    const endUserTag = String(
      metadata?.user_id ?? body.end_user_id ?? body.client_id ?? userId ?? "anonymous"
    );
    const sessionIdTag = String(
      body.session_id ?? body.sessionId ?? metadata?.session_id ?? metadata?.sessionId ?? ""
    ).trim() || null;

    if (!model || (prompt_tokens === undefined && input_tokens === undefined)) {
      return NextResponse.json(
        {
          error:
            "Bad Request: Required fields missing. Must provide 'model', 'prompt_tokens' (or 'input_tokens'), and 'completion_tokens' (or 'output_tokens').",
        },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const totalTokens = pTokens + cTokens;

    // 7. Dynamic pricing lookup from `model_pricing` DB table
    const modelKey = String(model).toLowerCase().trim();

    let roundedCost = 0;
    let cacheSavingsUSD = 0;
    let isEstimated = false;
    let warning: string | undefined;
    let provider = body.provider || "custom";

    let activePricing: ModelPricingRow | null = null;
    let fallbackPricing: ModelPricingRow | null = null;

    try {
      let { data: activeRow } = await supabaseAdmin
        .from("model_pricing")
        .select("model, provider, input_price_per_million, output_price_per_million, is_active")
        .eq("model", modelKey)
        .eq("is_active", true)
        .maybeSingle();

      if (!activeRow) {
        const { data: activeRowByName } = await supabaseAdmin
          .from("model_pricing")
          .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
          .eq("model_name", modelKey)
          .eq("is_active", true)
          .maybeSingle();
        if (activeRowByName) {
          activeRow = {
            model: (activeRowByName as any).model_name,
            provider: activeRowByName.provider,
            input_price_per_million: activeRowByName.input_price_per_million,
            output_price_per_million: activeRowByName.output_price_per_million,
            is_active: activeRowByName.is_active,
          };
        }
      }

      if (activeRow) {
        activePricing = activeRow as ModelPricingRow;
      } else {
        let { data: fallbackRow } = await supabaseAdmin
          .from("model_pricing")
          .select("model, provider, input_price_per_million, output_price_per_million, is_active")
          .eq("model", modelKey)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!fallbackRow) {
          const { data: fallbackRowByName } = await supabaseAdmin
            .from("model_pricing")
            .select("model_name, provider, input_price_per_million, output_price_per_million, is_active")
            .eq("model_name", modelKey)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackRowByName) {
            fallbackRow = {
              model: (fallbackRowByName as any).model_name,
              provider: fallbackRowByName.provider,
              input_price_per_million: fallbackRowByName.input_price_per_million,
              output_price_per_million: fallbackRowByName.output_price_per_million,
              is_active: fallbackRowByName.is_active,
            };
          }
        }

        if (fallbackRow) {
          fallbackPricing = fallbackRow as ModelPricingRow;
        }
      }
    } catch (err) {
      console.warn("model_pricing DB lookup notice:", err);
    }

    if (activePricing) {
      isEstimated = false;
      provider = activePricing.provider || provider;

      const inputRate = activePricing.input_price_per_million / 1_000_000;
      const outputRate = activePricing.output_price_per_million / 1_000_000;

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
      provider = fallbackPricing.provider || provider;

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

      const explicitCost = body.cost ?? body.total_cost_usd ?? body.calculated_cost;
      if (explicitCost !== undefined && explicitCost !== null && !isNaN(Number(explicitCost))) {
        roundedCost = Number(Number(explicitCost).toFixed(6));
      } else {
        const defaultInputCostPerToken = 1.0 / 1_000_000;
        const defaultOutputCostPerToken = 3.0 / 1_000_000;
        const calculatedCost = pTokens * defaultInputCostPerToken + cTokens * defaultOutputCostPerToken;
        roundedCost = Number(calculatedCost.toFixed(6));
      }
    }

    // 8. Circuit Breaker Spend Check on api_keys
    let budgetWarning: string | undefined;

    if (apiKeyRecord?.id) {
      const budgetCap = apiKeyRecord.budget_cap_usd !== null && apiKeyRecord.budget_cap_usd !== undefined
        ? Number(apiKeyRecord.budget_cap_usd)
        : null;
      const currentSpend = Number(apiKeyRecord.current_period_spend_usd ?? 0);
      const action = String(apiKeyRecord.budget_action || apiKeyRecord.budget_cap_action || "block_new_logs").toLowerCase();
      const newSpend = Number((currentSpend + roundedCost).toFixed(6));
      const budgetAlertSent = Boolean(apiKeyRecord.budget_alert_sent);
      const projectName = apiKeyRecord.name || "API Key Project";

      if (budgetCap !== null && budgetCap > 0 && newSpend > budgetCap) {
        dispatchWebhookAlert({
          event: "budget_exceeded",
          apiKeyName: projectName,
          currentSpend: newSpend,
          budgetCap,
          userId,
        }).catch(() => {/* silent */ });

        if (action === "block_new_logs" || action === "revoke_key") {
          (async () => {
            const ownerEmail = await getOwnerEmail(userId);
            if (ownerEmail) {
              await sendBudgetAlert({
                to: ownerEmail,
                projectName,
                currentSpend: newSpend,
                budgetCap,
                actionType: action,
                isCritical: true,
              });
            }
          })().catch((err) => console.error("[budget-alerts] Non-blocking critical email dispatch error:", err));

          if (!budgetAlertSent) {
            await supabaseAdmin
              .from("api_keys")
              .update({ budget_alert_sent: true })
              .eq("id", apiKeyRecord.id);
          }
        }

        if (action === "revoke_key") {
          await supabaseAdmin
            .from("api_keys")
            .update({ is_active: false, status: "suspended" })
            .eq("id", apiKeyRecord.id);

          return NextResponse.json(
            { error: "Budget cap exceeded: API key has been suspended", action: "revoke_key" },
            { status: 403, headers: getCorsHeaders() }
          );
        } else if (action === "alert_only") {
          budgetWarning = "Budget cap exceeded for this API key";
          await supabaseAdmin
            .from("api_keys")
            .update({ current_period_spend_usd: newSpend })
            .eq("id", apiKeyRecord.id);
        } else {
          return NextResponse.json(
            { error: "Budget cap exceeded", action: "block_new_logs" },
            { status: 402, headers: getCorsHeaders() }
          );
        }
      } else {
        if (budgetCap !== null && budgetCap > 0 && newSpend >= budgetCap * 0.8 && !budgetAlertSent) {
          await supabaseAdmin
            .from("api_keys")
            .update({ budget_alert_sent: true })
            .eq("id", apiKeyRecord.id);

          dispatchWebhookAlert({
            event: "budget_alert",
            apiKeyName: projectName,
            currentSpend: newSpend,
            budgetCap,
            userId,
          }).catch(() => {/* silent */ });

          (async () => {
            const ownerEmail = await getOwnerEmail(userId);
            if (ownerEmail) {
              await sendBudgetAlert({
                to: ownerEmail,
                projectName,
                currentSpend: newSpend,
                budgetCap,
                actionType: action,
                isCritical: false,
              });
            }
          })().catch((err) => console.error("[budget-alerts] Non-blocking warning email dispatch error:", err));
        }

        await supabaseAdmin
          .from("api_keys")
          .update({ current_period_spend_usd: newSpend })
          .eq("id", apiKeyRecord.id);
      }
    }

    const nowIso = new Date().toISOString();

    // 9. Strictly sanitized minimal insert payload
    const keyData = apiKeyRecord;
    const calculatedCost = roundedCost;

    const safeInsertPayload: Record<string, any> = {
      user_id: keyData.user_id,
      model: body.model,
      provider: body.provider || 'openai',
      input_tokens: Number(body.prompt_tokens || body.input_tokens || 0),
      output_tokens: Number(body.completion_tokens || body.output_tokens || 0),
      total_cost_usd: calculatedCost,
      latency_ms: Number(body.latency_ms || body.latency || 0),
      status_code: Number(body.status_code || 200),
      is_estimated: Boolean(body.is_estimated ?? false),
      ...(sessionIdTag && { session_id: sessionIdTag }),
      ...(agentTag && { agent_name: agentTag }),
      ...(body.prompt_version_id && { prompt_version_id: String(body.prompt_version_id) }),
      ...(idempotencyKey && { idempotency_key: idempotencyKey }),
    };

    // 10. Anomaly & Error Monitoring Check
    const spikeThreshold = Number(apiKeyRecord?.spike_threshold_usd ?? 1.0);
    const statusCode = Number(body.status_code || 200);

    if (calculatedCost >= spikeThreshold || statusCode >= 500) {
      (async () => {
        const ownerEmail = await getOwnerEmail(userId);
        if (ownerEmail) {
          await sendAnomalyAlert({
            to: ownerEmail,
            projectName: apiKeyRecord?.name || "Meterix Project",
            model: String(body.model),
            estimatedCost: calculatedCost,
            spikeThresholdUSD: spikeThreshold,
            timestamp: nowIso,
            userId,
            reason: statusCode >= 500
              ? `HTTP ${statusCode} Error Spike`
              : `Single Request Cost ($${calculatedCost.toFixed(4)}) exceeded threshold ($${spikeThreshold.toFixed(4)})`,
          });
        }
      })().catch((err) => console.error("[anomaly-alerts] Non-blocking anomaly email dispatch error:", err));
    }

    let logData: any = null;
    let { data: insertedData, error: logError } = await supabaseAdmin
      .from("usage_logs")
      .insert(safeInsertPayload)
      .select()
      .single();

    logData = insertedData;

    if (logError && idempotencyKey) {
      // Handle potential race condition or duplicate key insertion
      try {
        const { data: existingLog } = await supabaseAdmin
          .from("usage_logs")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existingLog) {
          const logCost = Number(existingLog.total_cost_usd ?? existingLog.cost_usd ?? existingLog.cost ?? 0);
          const pToks = Number(existingLog.input_tokens || 0);
          const cToks = Number(existingLog.output_tokens || 0);

          return NextResponse.json(
            {
              success: true,
              idempotent_replay: true,
              log_id: existingLog.id,
              model: existingLog.model || "gpt-4o",
              prompt_tokens: pToks,
              completion_tokens: cToks,
              cached_tokens: Number(existingLog.cached_tokens || 0),
              cache_creation_tokens: Number(existingLog.cache_creation_tokens || 0),
              total_tokens: pToks + cToks,
              calculated_cost: logCost,
              total_cost_usd: logCost,
              cache_savings_usd: Number(existingLog.cache_savings_usd || 0),
              is_estimated: Boolean(existingLog.is_estimated ?? false),
              environment: existingLog.environment || "production",
              agent_name: existingLog.agent_name || "default-agent",
              ...(existingLog.session_id && { session_id: existingLog.session_id }),
              currency: "USD",
              timestamp: existingLog.created_at || new Date().toISOString(),
            },
            { status: 200, headers: getCorsHeaders() }
          );
        }
      } catch (e) {}
    }

    if (logError) {
      console.error("[telemetry-ingest] Supabase insert error:", logError.message, logError.details);
      return NextResponse.json(
        { error: `Database write failed: ${logError.message}` },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    const logId = logData?.id || "log_" + Date.now();

    // 11. Return response
    return NextResponse.json(
      {
        success: true,
        log_id: logId,
        model: modelKey,
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        cached_tokens: cachedTokens,
        cache_creation_tokens: cacheCreationTokens,
        total_tokens: totalTokens,
        calculated_cost: roundedCost,
        total_cost_usd: roundedCost,
        cache_savings_usd: cacheSavingsUSD,
        is_estimated: isEstimated,
        ...(warning && { warning }),
        ...(warning && { pricing_warning: warning }),
        ...(budgetWarning && { budget_warning: budgetWarning }),
        environment: envTag,
        agent_name: agentTag || "default-agent",
        ...(sessionIdTag && { session_id: sessionIdTag }),
        currency: "USD",
        timestamp: nowIso,
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("Telemetry Ingestion Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

