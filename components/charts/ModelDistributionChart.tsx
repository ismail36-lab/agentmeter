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
  "gpt-4o": "#10b981",          // emerald-500
  "gpt-4o-mini": "#0ea5e9",     // sky-500
  "claude-3-5-sonnet": "#8b5cf6", // violet-500
  other: "#f59e0b",             // amber-500
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
    <div className="bento-card p-6 flex flex-col justify-between h-[360px]">
      <div>
        <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-violet-400" />
          Model Cost Breakdown
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Proportional spend by LLM architecture
        </p>
      </div>

      <div className="relative w-full flex-1 flex items-center justify-center my-2">
        {chartData.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center">
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
                        <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg shadow-xl text-xs font-mono">
                          <p className="text-zinc-200 font-semibold mb-1">{dataItem.name}</p>
                          <p className="text-emerald-400 font-bold">
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
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-zinc-900">
        {(chartData.length > 0 ? chartData : [
          { name: "gpt-4o", color: "#10b981" },
          { name: "gpt-4o-mini", color: "#0ea5e9" },
          { name: "claude-3-5-sonnet", color: "#8b5cf6" },
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
