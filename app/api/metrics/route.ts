import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#10b981",          // emerald-500
  "gpt-4o-mini": "#0ea5e9",     // sky-500
  "claude-3-5-sonnet": "#8b5cf6", // violet-500
  other: "#f59e0b",             // amber-500
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

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Query usage_logs filtered by user_id
    const { data: logs, error } = await supabaseAdmin
      .from("usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("metrics GET query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userLogs = logs || [];

    // Calculate core metrics
    const totalSpend = userLogs.reduce((acc, curr) => acc + getLogCost(curr), 0);
    const totalTokens = userLogs.reduce((acc, curr) => acc + getLogTokens(curr), 0);
    const totalRequests = userLogs.length;

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

    // Daily trend (last 7 days)
    const daysMap: Record<string, { spend: number; tokens: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
      daysMap[label] = { spend: 0, tokens: 0 };
    }

    userLogs.forEach((log) => {
      const dateStr = log.created_at || log.timestamp;
      if (!dateStr) return;
      const logDate = new Date(dateStr);
      const label = logDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
      if (daysMap[label]) {
        daysMap[label].spend += getLogCost(log);
        daysMap[label].tokens += getLogTokens(log);
      }
    });

    const dailyTrend = Object.entries(daysMap).map(([date, values]) => ({
      date,
      spend: Number(values.spend.toFixed(4)),
      tokens: values.tokens,
    }));

    // Model breakdown for Donut chart
    const modelBreakdownMap: Record<string, number> = {
      "gpt-4o": 0,
      "gpt-4o-mini": 0,
      "claude-3-5-sonnet": 0,
    };

    userLogs.forEach((log) => {
      const key = log.model in modelBreakdownMap ? log.model : "other";
      modelBreakdownMap[key] = (modelBreakdownMap[key] || 0) + getLogCost(log);
    });

    const modelBreakdown = Object.entries(modelBreakdownMap).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(5)),
      color: MODEL_COLORS[name] || MODEL_COLORS.other,
    }));

    return NextResponse.json({
      metrics: {
        totalSpend: Number(totalSpend.toFixed(4)),
        totalTokens,
        totalRequests,
        topModel,
      },
      dailyTrend,
      modelBreakdown,
    });
  } catch (err: any) {
    console.error("metrics GET exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
