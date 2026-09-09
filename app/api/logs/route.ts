import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const KNOWN_MODELS = new Set([
  "gpt-4o",
  "gpt-4o-mini",
  "o1",
  "o1-preview",
  "o1-mini",
  "claude-3-5-sonnet",
  "claude-3.5-sonnet",
  "claude-3-haiku",
  "claude-3.5-haiku",
  "claude-3-opus",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
]);

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    let logs: any[] = [];
    let queryError: any = null;

    // 1. Primary lookup: usage_logs table ordered by created_at DESC
    const { data: uLogs, error: uErr } = await supabaseAdmin
      .from("usage_logs")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!uErr && uLogs && uLogs.length > 0) {
      logs = uLogs;
    } else {
      if (uErr) queryError = uErr;
      // 2. Secondary fallback: telemetry_logs table
      const { data: tLogs, error: tErr } = await supabaseAdmin
        .from("telemetry_logs")
        .select("*")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (tLogs && tLogs.length > 0) {
        logs = tLogs;
        queryError = null;
      }
    }

    if (queryError && logs.length === 0) {
      return NextResponse.json({ error: queryError.message }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    // Standardize log fields: created_at, model, prompt_tokens, completion_tokens, total_tokens, cost, is_estimated
    const mappedLogs = logs.map((log) => {
      const rawPayload = log.raw_payload || log.metadata || {};
      const pTokens = Number(log.prompt_tokens ?? log.input_tokens ?? 0);
      const cTokens = Number(log.completion_tokens ?? log.output_tokens ?? 0);
      const tTokens = Number(log.total_tokens ?? (pTokens + cTokens));
      const costVal = Number(log.cost_usd ?? log.total_cost_usd ?? log.cost ?? 0);
      const modelName = String(log.model || "other").toLowerCase().trim();

      const isExplicitlyEstimated = log.is_estimated === true || rawPayload.is_estimated === true;
      const isUnknownWithoutCost = !KNOWN_MODELS.has(modelName) && costVal === 0;
      const isEstimated = isExplicitlyEstimated || isUnknownWithoutCost;

      const env = log.environment || rawPayload.environment || rawPayload.metadata?.environment || "production";
      const agent = log.agent_name || rawPayload.agent_name || rawPayload.metadata?.agent_name || "default-agent";

      return {
        id: log.id,
        created_at: log.created_at || log.timestamp || new Date().toISOString(),
        model: log.model || "other",
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        total_tokens: tTokens,
        cost: costVal,
        cost_usd: costVal,
        total_cost_usd: costVal,
        is_estimated: isEstimated,
        user_id: log.user_id,
        environment: env,
        agent_name: agent,
        raw_payload: rawPayload,
      };
    });

    return NextResponse.json({ logs: mappedLogs }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error("logs GET exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

