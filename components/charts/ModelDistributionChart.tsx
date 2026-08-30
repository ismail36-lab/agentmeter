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
  // OpenAI Models → Indigo (matches primary brand accent)
  "gpt-4o":       "#6366f1",
  "gpt-4o-mini":  "#818cf8",

  // Anthropic Models → Terracotta / Orange
  "claude-3-5-sonnet": "#f97316",
  "claude-3.5-sonnet": "#f97316",

  // Google Gemini Models → Electric Blue
  "gemini-1.5-pro":   "#3b82f6",
  "gemini-1.5-flash":  "#60a5fa",
  "gemini-2.0-flash":  "#2563eb",

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

  // Fallback placeholder legend items shown when no real data exists
  const legendItems = chartData.length > 0
    ? chartData
    : [
        { name: "gpt-4o",            color: "#6366f1" },
        { name: "claude-3-5-sonnet", color: "#f97316" },
        { name: "gemini-1.5-pro",    color: "#3b82f6" },
      ];

  return (
    <div className="bento-card bento-card-hover flex flex-col border border-zinc-800/80 bg-zinc-900/90 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2 font-sans tracking-tight">
          <PieIcon className="h-4 w-4 text-indigo-400" />
          Model Cost Breakdown
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5 font-sans">
          Proportional spend by LLM provider architecture
        </p>
      </div>

      {/* Donut Chart */}
      <div className="relative w-full flex-1 min-h-[180px] px-4">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-zinc-500 font-mono">
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
                  innerRadius={58}
                  outerRadius={80}
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

      {/* Legend — stacked column so names never clip */}
      <div className="px-5 pt-3 pb-4 border-t border-zinc-800/80 shrink-0">
        <div className="flex flex-col gap-1.5">
          {legendItems.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-xs text-zinc-400 font-mono min-w-0">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color || DEFAULT_COLORS[item.name] || DEFAULT_COLORS.other }}
              />
              <span className="truncate">{item.name}</span>
              {chartData.length > 0 && "value" in item && (
                <span className="ml-auto font-semibold text-zinc-300 shrink-0 pl-2">
                  ${Number((item as ModelBreakdownItem).value).toFixed(4)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
