"use client";

import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { PieChart as PieIcon } from "lucide-react";

export interface ModelBreakdownItem {
  name: string;
  value: number;
  color?: string;
}

interface ModelDistributionChartProps {
  data: ModelBreakdownItem[];
  totalSpend?: number;
}

const DEFAULT_COLORS: Record<string, string> = {
  // OpenAI Models -> Emerald Green
  "gpt-4o": "#10b981",
  "gpt-4o-mini": "#059669",
  
  // Anthropic Models -> Terracotta / Orange
  "claude-3-5-sonnet": "#f97316",
  "claude-3.5-sonnet": "#f97316",
  
  // Google Gemini Models -> Electric Blue
  "gemini-1.5-pro": "#3b82f6",
  "gemini-1.5-flash": "#60a5fa",
  "gemini-2.0-flash": "#2563eb",
  
  other: "#f59e0b",
};

export function ModelDistributionChart({ data, totalSpend }: ModelDistributionChartProps) {
  const chartData = (data && data.length > 0 ? data : [])
    .filter((item) => item.value > 0)
    .map((item) => ({
      name: item.name,
      value: item.value,
      color: item.color || DEFAULT_COLORS[item.name] || DEFAULT_COLORS.other,
    }));

  const calculatedTotal = chartData.reduce((acc, curr) => acc + curr.value, 0);
  const displayTotal = totalSpend !== undefined && totalSpend > 0 ? totalSpend : calculatedTotal;

  return (
    <div className="bento-card bento-card-hover p-6 flex flex-col justify-between h-[360px] border border-zinc-800/80 bg-zinc-900/90">
      <div>
        <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2 font-sans tracking-tight">
          <PieIcon className="h-4 w-4 text-indigo-400" />
          Model Cost Breakdown
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5 font-sans">
          Proportional spend by LLM provider architecture
        </p>
      </div>

      <div className="relative w-full flex-1 flex items-center justify-center my-2">
        {chartData.length === 0 ? (
          <div className="text-xs text-zinc-500 font-mono text-center">
            No model spend recorded yet
          </div>
        ) : (
          <div className="w-full h-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={88}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="#18181b"
                  strokeWidth={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const dataItem = payload[0];
                      const val = Number(dataItem.value);
                      const pct = displayTotal > 0 ? ((val / displayTotal) * 100).toFixed(1) : "0";
                      return (
                        <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                          <p className="text-zinc-200 font-semibold mb-1">{dataItem.name}</p>
                          <p className="text-indigo-400 font-bold">
                            ${val.toFixed(4)} ({pct}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Overlay Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">Total</span>
              <span className="text-sm font-bold font-mono text-zinc-100">${displayTotal.toFixed(4)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend list below chart */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-zinc-800/80">
        {(chartData.length > 0 ? chartData : [
          { name: "gpt-4o", color: "#10b981" },
          { name: "claude-3-5-sonnet", color: "#f97316" },
          { name: "gemini-1.5-pro", color: "#3b82f6" },
        ]).map((item) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: item.color || DEFAULT_COLORS[item.name] || DEFAULT_COLORS.other }}
            />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
