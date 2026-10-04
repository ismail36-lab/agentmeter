import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyApiKey } from "@/lib/auth/meterix";
import { parseOtelSpans, MappedOtelSpan } from "@/lib/otel-adapter";
import { getCacheReadMultiplier } from "@/lib/pricing";
import { checkRateLimitAsync } from "@/lib/rate-limiter";
import { checkMonthlyQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Extract API Key from Authorization Bearer or x-api-key header ──
    const authHeader = req.headers.get("authorization");
    const xApiKey = req.headers.get("x-api-key");

    let apiKey = "";
    if (xApiKey && xApiKey.trim()) {
      apiKey = xApiKey.trim();
    } else if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else if (authHeader && authHeader !== "anonymous") {
      apiKey = authHeader.trim();
    }

    apiKey = apiKey.replace(/^["']|["']$/g, "").trim();

    if (!apiKey) {
      console.log("[otel-route] Authentication failed: Missing API Key in Authorization or x-api-key header");
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key in Authorization header or x-api-key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // ── 2. Authenticate API Key via SHA-256 hash lookup against api_keys table ──
    const authResult = await verifyApiKey(apiKey);
    if (!authResult.success || !authResult.apiKeyRecord) {
      console.log("[otel-route] Authentication failed:", authResult.error);
      return NextResponse.json(
        { error: authResult.error || "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // Set default user_id associated with the validated API key
    const keyRecord = authResult.apiKeyRecord;
    const userId = authResult.userId || keyRecord.user_id || "anonymous";

    // Resolve plan from public.profiles (single source of truth)
    let userPlan = "free";
    if (userId && userId !== "anonymous") {
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
        console.warn("[otel-route] Could not fetch plan:", err);
      }
    }

    // ── 3. Post-Authentication Rate Limit Check ──────────────────────────────
    const rateLimitIdentifier = `telemetry:${keyRecord.id || userId}`;
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

    // ── 4. Monthly Quota Limit Enforcement ──────────────────────────────────
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

    // ── 5. Budget Cap Circuit Breaker Check ──────────────────────────────────
    const maxBudget = keyRecord.max_budget_usd !== null && keyRecord.max_budget_usd !== undefined
      ? Number(keyRecord.max_budget_usd)
      : (keyRecord.budget_cap_usd !== null && keyRecord.budget_cap_usd !== undefined
        ? Number(keyRecord.budget_cap_usd)
        : null);
    const currentSpend = Number(keyRecord.current_period_spend_usd ?? 0);
    const budgetAction = String(keyRecord.budget_action || keyRecord.budget_cap_action || "block_new_logs").toLowerCase();

    if (maxBudget !== null && maxBudget > 0 && currentSpend >= maxBudget) {
      if (budgetAction === "revoke_key") {
        await supabaseAdmin
          .from("api_keys")
          .update({ is_active: false, status: "suspended" })
          .eq("id", keyRecord.id);

        return NextResponse.json(
          { error: "Budget cap exceeded: API key has been suspended", action: "revoke_key" },
          { status: 403, headers: getCorsHeaders() }
        );
      } else if (budgetAction !== "alert_only") {
        return NextResponse.json(
          { error: "Budget cap exceeded", action: "block_new_logs" },
          { status: 402, headers: getCorsHeaders() }
        );
      }
    }

    // ── 6. Parse OTLP JSON Body safely ─────────────────────────────────────
    const body = await req.json().catch((jsonErr) => {
      console.warn("[otel-route] Invalid or empty JSON body received:", jsonErr);
      return {};
    });

    let mappedSpans: MappedOtelSpan[] = [];
    try {
      mappedSpans = parseOtelSpans(body);
    } catch (parseErr: any) {
      console.error("[otel-route] Failed parsing OTLP resourceSpans payload:", parseErr);
      mappedSpans = [];
    }

    if (mappedSpans.length === 0) {
      // OTLP-compliant success response when no LLM spans matched in payload
      return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
    }

    // ── 7. Process and Ingest Mapped Spans into usage_logs ─────────────────
    const insertRows: Record<string, any>[] = [];

    for (const span of mappedSpans) {
      const modelKey = (span.model || "unknown-model").toLowerCase().trim();

      // Look up dynamic model pricing
      let inputRate = 1.0 / 1_000_000;
      let outputRate = 3.0 / 1_000_000;
      let isEstimated = true;
      let provider = span.provider || "custom";

      try {
        let { data: pricingRow } = await supabaseAdmin
          .from("model_pricing")
          .select("input_price_per_million, output_price_per_million, provider")
          .eq("model", modelKey)
          .eq("is_active", true)
          .maybeSingle();

        if (!pricingRow) {
          const { data: pricingByName } = await supabaseAdmin
            .from("model_pricing")
            .select("input_price_per_million, output_price_per_million, provider")
            .eq("model_name", modelKey)
            .eq("is_active", true)
            .maybeSingle();
          if (pricingByName) pricingRow = pricingByName;
        }

        if (pricingRow) {
          isEstimated = false;
          provider = pricingRow.provider || provider;
          inputRate = pricingRow.input_price_per_million / 1_000_000;
          outputRate = pricingRow.output_price_per_million / 1_000_000;
        }
      } catch (err) {
        console.warn("[otel-route] DB model_pricing lookup notice:", err);
      }

      const cacheReadMult = getCacheReadMultiplier(provider, modelKey);
      const cacheReadRate = inputRate * cacheReadMult;

      const safeCached = Math.max(0, span.cached_tokens || 0);
      const regularInput = Math.max(0, (span.prompt_tokens || 0) - safeCached);

      const calculatedCost =
        (regularInput * inputRate) +
        (safeCached * cacheReadRate) +
        ((span.completion_tokens || 0) * outputRate);

      const roundedCost = Number(calculatedCost.toFixed(6));

      insertRows.push({
        user_id: userId,
        model: span.model || "unknown-model",
        provider,
        input_tokens: Number(span.prompt_tokens || 0),
        output_tokens: Number(span.completion_tokens || 0),
        total_cost_usd: roundedCost,
        latency_ms: Number(span.latency_ms || 0),
        status_code: Number(span.status_code || 200),
        is_estimated: isEstimated,
        ...(span.session_id && { session_id: span.session_id }),
        ...(span.agent_name && { agent_name: span.agent_name }),
        ...(span.environment && { environment: span.environment }),
      });
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("usage_logs")
        .insert(insertRows);

      if (insertError) {
        console.error("[otel-route] Supabase insert error:", insertError.message, insertError.details);
        return NextResponse.json(
          { error: `Database insertion failed: ${insertError.message}` },
          { status: 500, headers: getCorsHeaders() }
        );
      }

      // Update API Key current_period_spend_usd
      if (keyRecord?.id) {
        const totalBatchCost = insertRows.reduce((acc, r) => acc + Number(r.total_cost_usd || 0), 0);
        if (totalBatchCost > 0) {
          const roundedCost = totalBatchCost;
          try {
            const { error: rpcErr } = await supabaseAdmin.rpc("increment_key_spend", {
              key_id: keyRecord.id,
              amount: roundedCost,
            });
            if (rpcErr) {
              console.warn("[otel] increment_key_spend RPC error:", rpcErr.message);
            }
          } catch (rpcErr) {
            console.warn("[otel] increment_key_spend RPC exception:", rpcErr);
          }
        }
      }
    }

    // ── 8. Return OTLP-compliant success response ({}) with HTTP 200 ──────
    return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || "Internal Server Error";
    console.error("[otel-route] 500 Internal Error during OTLP trace ingestion:", error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

