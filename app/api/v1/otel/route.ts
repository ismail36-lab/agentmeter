import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyApiKey } from "@/lib/auth/meterix";
import { parseOtelSpans, MappedOtelSpan } from "@/lib/otel-adapter";
import { getCacheReadMultiplier } from "@/lib/pricing";

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
      return NextResponse.json(
        { error: "Unauthorized: Missing API Key in Authorization header or x-api-key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // ── 2. Authenticate API Key ──
    const authResult = await verifyApiKey(apiKey);
    if (!authResult.success || !authResult.apiKeyRecord || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized: Invalid API Key" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    const userId = authResult.userId;

    // ── 3. Parse OTLP JSON Body ──
    const body = await req.json().catch(() => ({}));
    const mappedSpans: MappedOtelSpan[] = parseOtelSpans(body);

    if (mappedSpans.length === 0) {
      // OTLP success response when no LLM spans matched in payload
      return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
    }

    // ── 4. Process and Ingest Spans into usage_logs ──
    const insertRows: Record<string, any>[] = [];

    for (const span of mappedSpans) {
      const modelKey = span.model.toLowerCase().trim();

      // Look up pricing for span model
      let inputRate = 1.0 / 1_000_000;
      let outputRate = 3.0 / 1_000_000;
      let isEstimated = true;
      let provider = span.provider;

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
        console.warn("[otel-ingest] DB model_pricing lookup notice:", err);
      }

      const cacheReadMult = getCacheReadMultiplier(provider, modelKey);
      const cacheReadRate = inputRate * cacheReadMult;

      const safeCached = Math.max(0, span.cached_tokens);
      const regularInput = Math.max(0, span.prompt_tokens - safeCached);

      const calculatedCost =
        (regularInput * inputRate) +
        (safeCached * cacheReadRate) +
        (span.completion_tokens * outputRate);

      const roundedCost = Number(calculatedCost.toFixed(6));

      insertRows.push({
        user_id: userId,
        model: span.model,
        provider,
        input_tokens: span.prompt_tokens,
        output_tokens: span.completion_tokens,
        total_cost_usd: roundedCost,
        latency_ms: span.latency_ms,
        status_code: span.status_code,
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
        console.error("[otel-ingest] Supabase insertion error:", insertError.message);
        return NextResponse.json(
          { error: `Database insertion failed: ${insertError.message}` },
          { status: 500, headers: getCorsHeaders() }
        );
      }
    }

    // ── 5. Return OTLP-compliant success response ──
    return NextResponse.json({}, { status: 200, headers: getCorsHeaders() });
  } catch (error: any) {
    console.error("[otel-ingest] Error handling OTLP trace ingestion:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message || String(error) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
