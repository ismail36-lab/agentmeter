"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp, DollarSign, Cpu } from "lucide-react";

export interface DailyTrendItem {
  date: string;
  cost?: number;
  spend?: number;
  tokens?: number;
}

interface UsageTrendChartProps {
  data: DailyTrendItem[];
}

export function UsageTrendChart({ data }: UsageTrendChartProps) {
  const [metricType, setMetricType] = useState<"spend" | "tokens">("spend");

  const formattedData = (data && data.length > 0 ? data : []).map((item) => ({
    date: item.date,
    spend: Number(item.cost ?? item.spend ?? 0),
    tokens: Number(item.tokens ?? 0),
  }));

  const isSpend = metricType === "spend";

  return (
    <div className="bento-card p-6 flex flex-col justify-between h-[360px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            30-Day Usage & Spend Trend
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Daily historical telemetry volume and calculated cost
          </p>
        </div>

        {/* Metric Selector Toggle */}
        <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setMetricType("spend")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              isSpend
                ? "bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/60"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
            Spend ($)
          </button>
          <button
            onClick={() => setMetricType("tokens")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              !isSpend
                ? "bg-zinc-800 text-sky-400 shadow-sm border border-zinc-700/60"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Tokens
          </button>
        </div>
      </div>

      <div className="w-full flex-1 min-h-[220px]">
        {formattedData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-500">
            No historical trend data available yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 10 }}
                axisLine={{ stroke: "#27272a" }}
                tickLine={false}
                dy={5}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 10 }}
                axisLine={{ stroke: "#27272a" }}
                tickLine={false}
                tickFormatter={(val) => (isSpend ? `$${val}` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const val = payload[0].value as number;
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                        <p className="text-zinc-400 font-semibold mb-1">{label}</p>
                        <p className={isSpend ? "text-emerald-400 font-bold" : "text-sky-400 font-bold"}>
                          {isSpend ? `$${Number(val).toFixed(6)}` : `${val.toLocaleString()} tokens`}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={isSpend ? "spend" : "tokens"}
                stroke={isSpend ? "#10b981" : "#0ea5e9"}
                strokeWidth={2}
                fillOpacity={1}
                fill={isSpend ? "url(#spendGradient)" : "url(#tokensGradient)"}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
