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

    // Fallback: If user has 0 logs, seed realistic mock demo metrics, caching stats, environment & agent breakdown
    if (userLogs.length === 0) {
      const demoSpend = 14.8250;
      const demoTokens = 1284500;
      const demoRequests = 342;
      const demoTopModel = "gpt-4o";

      const demoModelBreakdown = [
        { name: "gpt-4o", value: 8.4500, color: "#6366f1" },
        { name: "claude-3-5-sonnet", value: 4.8250, color: "#f97316" },
        { name: "gemini-1.5-pro", value: 1.5500, color: "#3b82f6" },
      ];

      const demoEnvironmentBreakdown = [
        { name: "production", spend: 11.2400, requests: 245, percentage: 75.8 },
        { name: "staging", spend: 2.8500, requests: 68, percentage: 19.2 },
        { name: "development", spend: 0.7350, requests: 29, percentage: 5.0 },
      ];

      const demoAgentBreakdown = [
        { name: "customer-support-bot", spend: 6.8400, requests: 142, model: "gpt-4o", top_model: "gpt-4o", distinct_models: 3, extra_models_count: 2 },
        { name: "code-review-assistant", spend: 4.8250, requests: 98, model: "claude-3-5-sonnet", top_model: "claude-3-5-sonnet", distinct_models: 1, extra_models_count: 0 },
        { name: "doc-summarizer", spend: 2.4250, requests: 74, model: "gemini-1.5-pro", top_model: "gemini-1.5-pro", distinct_models: 2, extra_models_count: 1 },
        { name: "triage-router", spend: 0.7350, requests: 28, model: "gpt-4o-mini", top_model: "gpt-4o-mini", distinct_models: 1, extra_models_count: 0 },
      ];

      const demoCachingMetrics = {
        totalCachedTokens: 412500,
        cacheHitRate: 32.1,
        totalSavingsUSD: 3.7125,
      };

      const demoTrend = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
        const baseSpend = 0.25 + Math.sin(i * 0.4) * 0.15 + (i % 7 === 0 ? 0.35 : 0.05);
        const spendVal = Number(baseSpend.toFixed(4));
        const tokensVal = Math.round(spendVal * 85000);
        demoTrend.push({
          date: label,
          cost: spendVal,
          spend: spendVal,
          tokens: tokensVal,
        });
      }

      return NextResponse.json(
        {
          is_demo: true,
          metrics: {
            totalSpend: demoSpend,
            totalTokens: demoTokens,
            totalRequests: demoRequests,
            topModel: demoTopModel,
          },
          cachingMetrics: demoCachingMetrics,
          environmentBreakdown: demoEnvironmentBreakdown,
          agentBreakdown: demoAgentBreakdown,
          dailyTrend: demoTrend,
          daily_trends: demoTrend,
          modelBreakdown: demoModelBreakdown,
          model_breakdown: demoModelBreakdown,
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // Calculate core metrics for real logs
    const totalSpend = userLogs.reduce((acc, curr) => acc + getLogCost(curr), 0);
    const totalTokens = userLogs.reduce((acc, curr) => acc + getLogTokens(curr), 0);
    const totalRequests = userLogs.length;

    // Prompt Caching metrics
    let totalCachedTokens = 0;
    let totalInputTokens = 0;
    let totalSavingsUSD = 0;

    userLogs.forEach((log) => {
      const input = Number(log.input_tokens ?? log.prompt_tokens ?? 0);
      const cached = Number(log.cached_tokens ?? log.metadata?.cached_tokens ?? 0);
      totalInputTokens += input;
      totalCachedTokens += cached;
      const rate = (log.provider || "").toLowerCase() === "anthropic" ? 0.000003 * 0.90 : 0.0000025 * 0.50;
      totalSavingsUSD += cached * rate;
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
