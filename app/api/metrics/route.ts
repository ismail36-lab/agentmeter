import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#6366f1",          // Indigo
  "gpt-4o-mini": "#818cf8",     // Light Indigo
  "claude-3-5-sonnet": "#f97316", // Terracotta / Orange
  "claude-3.5-sonnet": "#f97316",
  "gemini-1.5-pro": "#3b82f6",   // Electric Blue
  "gemini-1.5-flash": "#60a5fa", // Light Blue
  "gemini-2.0-flash": "#2563eb",
  other: "#f59e0b",             // Amber
};

/** Helper to parse spend/cost from log row */
function getLogCost(log: any): number {
  const val = Number(log.total_cost_usd ?? log.cost ?? 0);
  return isNaN(val) ? 0 : val;
}

/** Helper to parse total tokens from log row */
function getLogTokens(log: any): number {
  if (log.total_tokens !== undefined && log.total_tokens !== null) {
    const val = Number(log.total_tokens);
    if (!isNaN(val) && val > 0) return val;
  }
  const input = Number(log.input_tokens ?? log.prompt_tokens ?? 0);
  const output = Number(log.output_tokens ?? log.completion_tokens ?? 0);
  const sum = (isNaN(input) ? 0 : input) + (isNaN(output) ? 0 : output);
  return sum;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    // Query usage_logs filtered by user_id or orphan logs
    const { data: logs, error } = await supabaseAdmin
      .from("usage_logs")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("metrics GET query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    const userLogs = logs || [];

    // When user has 0 logs, return clean zero/empty metrics
    if (userLogs.length === 0) {
      return NextResponse.json(
        {
          is_demo: false,
          metrics: {
            totalSpend: 0,
            totalTokens: 0,
            totalRequests: 0,
            topModel: "N/A",
          },
          cachingMetrics: {
            totalCachedTokens: 0,
            cacheHitRate: 0,
            totalSavingsUSD: 0,
          },
          environmentBreakdown: [],
          agentBreakdown: [],
          dailyTrend: [],
          daily_trends: [],
          modelBreakdown: [],
          model_breakdown: [],
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // Calculate core metrics for real logs
    const totalSpend = userLogs.reduce((acc, curr) => acc + getLogCost(curr), 0);
    const totalTokens = userLogs.reduce((acc, curr) => acc + getLogTokens(curr), 0);
    const totalRequests = userLogs.length;

    // Fetch active and historical model pricing for accurate caching savings calculation
    const { data: pricingRows } = await supabaseAdmin
      .from("model_pricing")
      .select("model, model_name, provider, input_price_per_million");

    const pricingRatesMap: Record<string, { inputRate: number; provider: string }> = {};
    (pricingRows ?? []).forEach((row: any) => {
      const key = String(row.model || row.model_name || "").toLowerCase().trim();
      if (key) {
        pricingRatesMap[key] = {
          inputRate: Number(row.input_price_per_million ?? 0) / 1_000_000,
          provider: String(row.provider || "").toLowerCase(),
        };
      }
    });

    // Prompt Caching metrics
    let totalCachedTokens = 0;
    let totalInputTokens = 0;
    let totalSavingsUSD = 0;

    userLogs.forEach((log) => {
      const input = Number(log.input_tokens ?? log.prompt_tokens ?? 0);
      const cached = Number(log.cached_tokens ?? log.metadata?.cached_tokens ?? 0);
      const modelKey = String(log.model || "").toLowerCase().trim();
      const pricing = pricingRatesMap[modelKey];
      const provider = pricing?.provider || String(log.provider || "").toLowerCase();

      const inputRate = pricing?.inputRate ?? (provider === "anthropic" ? 3.0 / 1_000_000 : 2.5 / 1_000_000);
      const cacheReadMultiplier = provider === "anthropic" ? 0.10 : 0.50;
      const cacheReadRate = inputRate * cacheReadMultiplier;
      const savingsPerToken = inputRate - cacheReadRate;

      totalInputTokens += input;
      totalCachedTokens += cached;
      totalSavingsUSD += cached * savingsPerToken;
    });

    const cacheHitRate = totalInputTokens > 0 ? Number(((totalCachedTokens / totalInputTokens) * 100).toFixed(1)) : 0;

    // Top model calculation
    const modelSpendMap: Record<string, number> = {};
    userLogs.forEach((log) => {
      const m = log.model || "other";
      modelSpendMap[m] = (modelSpendMap[m] || 0) + getLogCost(log);
    });

    let topModel = "N/A";
    let maxSpend = -1;
    Object.entries(modelSpendMap).forEach(([model, spend]) => {
      if (spend > maxSpend) {
        maxSpend = spend;
        topModel = model;
      }
    });

    // Environment Breakdown calculation
    const envMap: Record<string, { spend: number; requests: number }> = {};
    userLogs.forEach((log) => {
      const env = (log.environment || log.metadata?.environment || "production").toLowerCase();
      if (!envMap[env]) envMap[env] = { spend: 0, requests: 0 };
      envMap[env].spend += getLogCost(log);
      envMap[env].requests += 1;
    });

    const environmentBreakdown = Object.entries(envMap).map(([name, data]) => ({
      name,
      spend: Number(data.spend.toFixed(4)),
      requests: data.requests,
      percentage: totalSpend > 0 ? Number(((data.spend / totalSpend) * 100).toFixed(1)) : 0,
    }));

    // Agent Breakdown calculation (two-level aggregation per agent_name)
    const agentMap: Record<
      string,
      { spend: number; requests: number; modelSpendMap: Record<string, number> }
    > = {};

    userLogs.forEach((log) => {
      const agent = log.agent_name || log.metadata?.agent_name || "default-agent";
      const model = log.model || "gpt-4o";
      const cost = getLogCost(log);

      if (!agentMap[agent]) {
        agentMap[agent] = { spend: 0, requests: 0, modelSpendMap: {} };
      }
      agentMap[agent].spend += cost;
      agentMap[agent].requests += 1;
      agentMap[agent].modelSpendMap[model] = (agentMap[agent].modelSpendMap[model] || 0) + cost;
    });

    const agentBreakdown = Object.entries(agentMap)
      .map(([name, data]) => {
        const models = Object.keys(data.modelSpendMap);
        const distinctModelsCount = models.length;

        // Determine top model with highest spend
        let topModel = models[0] || "gpt-4o";
        let maxSpend = -1;
        models.forEach((m) => {
          if (data.modelSpendMap[m] > maxSpend) {
            maxSpend = data.modelSpendMap[m];
            topModel = m;
          }
        });

        const extraModelsCount = Math.max(0, distinctModelsCount - 1);

        return {
          name,
          spend: Number(data.spend.toFixed(4)),
          requests: data.requests,
          model: topModel,
          top_model: topModel,
          distinct_models: distinctModelsCount,
          extra_models_count: extraModelsCount,
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    // Daily trend (last 30 days)
    const daysMap: Record<string, { cost: number; spend: number; tokens: number }> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
      daysMap[label] = { cost: 0, spend: 0, tokens: 0 };
    }

    userLogs.forEach((log) => {
      const dateStr = log.created_at || log.timestamp;
      if (!dateStr) return;
      const logDate = new Date(dateStr);
      const label = logDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
      if (daysMap[label]) {
        const cVal = getLogCost(log);
        const tVal = getLogTokens(log);
        daysMap[label].cost += cVal;
        daysMap[label].spend += cVal;
        daysMap[label].tokens += tVal;
      }
    });

    const dailyTrend = Object.entries(daysMap).map(([date, values]) => ({
      date,
      cost: Number(values.cost.toFixed(6)),
      spend: Number(values.spend.toFixed(4)),
      tokens: values.tokens,
    }));

    // Model breakdown for Donut chart
    const modelBreakdownMap: Record<string, number> = {};
    userLogs.forEach((log) => {
      const m = log.model || "other";
      modelBreakdownMap[m] = (modelBreakdownMap[m] || 0) + getLogCost(log);
    });

    const modelBreakdown = Object.entries(modelBreakdownMap).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(6)),
      color: MODEL_COLORS[name] || MODEL_COLORS.other,
    }));

    return NextResponse.json(
      {
        is_demo: false,
        metrics: {
          totalSpend: Number(totalSpend.toFixed(4)),
          totalTokens,
          totalRequests,
          topModel,
        },
        cachingMetrics: {
          totalCachedTokens,
          cacheHitRate,
          totalSavingsUSD: Number(totalSavingsUSD.toFixed(4)),
        },
        environmentBreakdown,
        agentBreakdown,
        dailyTrend,
        daily_trends: dailyTrend,
        modelBreakdown,
        model_breakdown: modelBreakdown,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    console.error("metrics GET exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
