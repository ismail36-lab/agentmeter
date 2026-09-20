"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";

export interface DashboardHeaderProps {
  activeKeyCount?: number;
}

function getModelTagColor(model: string) {
  const m = model.toLowerCase();
  if (m.includes("gpt-4o-mini")) return "text-sky-400 bg-sky-950/40 border-sky-900/60";
  if (m.includes("gpt-4") || m.includes("gpt-3")) return "text-emerald-400 bg-emerald-950/40 border-emerald-900/60";
  if (m.includes("claude") || m.includes("sonnet") || m.includes("haiku")) return "text-violet-400 bg-violet-950/40 border-violet-900/60";
  if (m.includes("gemini")) return "text-blue-400 bg-blue-950/40 border-blue-900/60";
  return "text-indigo-400 bg-indigo-950/40 border-indigo-900/60";
}

export function DashboardHeader({ activeKeyCount = 0 }: DashboardHeaderProps) {
  const [supportedModels, setSupportedModels] = useState<string[]>([]);
  const [formattedText, setFormattedText] = useState<string>("OpenAI, Anthropic, and Gemini models");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchSupportedModels() {
      try {
        const res = await fetch("/api/models/supported", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted && data.models && Array.isArray(data.models)) {
          const validList = data.models.filter(
            (m: any) => typeof m === "string" && m.trim().length > 0
          );
          if (validList.length > 0) {
            setSupportedModels(validList);
            if (data.formatted) {
              setFormattedText(data.formatted);
            }
          }
        }
      } catch (err) {
        console.warn("[DashboardHeader] Could not fetch dynamic supported models:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchSupportedModels();

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to render inline model badges cleanly
  const renderModelList = () => {
    const validModels = (supportedModels || []).filter(
      (m) => typeof m === "string" && m.trim().length > 0
    );

    if (isLoading || validModels.length === 0) {
      return <span className="text-zinc-300 font-medium">{formattedText}</span>;
    }

    const maxDisplay = 3;
    const topModels = validModels.slice(0, maxDisplay);
    const hasMore = validModels.length > maxDisplay;

    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 align-baseline">
        {topModels.map((model, idx) => {
          const colorClass = getModelTagColor(model);

          return (
            <React.Fragment key={`${model}-${idx}`}>
              <code className={`px-1.5 py-0.5 rounded border font-mono text-xs ${colorClass}`}>
                {model}
              </code>

              {/* Formatting without 'and more' */}
              {!hasMore && topModels.length === 2 && idx === 0 && (
                <span className="text-zinc-400">and</span>
              )}
              {!hasMore && topModels.length > 2 && idx < topModels.length - 2 && (
                <span className="text-zinc-400">,</span>
              )}
              {!hasMore && topModels.length > 2 && idx === topModels.length - 2 && (
                <span className="text-zinc-400">, and</span>
              )}

              {/* Formatting with 'and more' */}
              {hasMore && idx < topModels.length - 1 && (
                <span className="text-zinc-400">,</span>
              )}
            </React.Fragment>
          );
        })}

        {hasMore && (
          <>
            <span className="text-zinc-400">, and</span>
            <span className="text-indigo-400 font-medium font-mono text-xs px-1.5 py-0.5 rounded border border-indigo-900/60 bg-indigo-950/40">
              more
            </span>
          </>
        )}
      </span>
    );
  };

  return (
    <div className="bento-card p-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border border-zinc-800/80 bg-zinc-900/90 font-sans">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50 flex items-center gap-2 tracking-tight">
          LLM Telemetry &amp; Cost Analytics
          <ShieldCheck className="h-4.5 w-4.5 text-indigo-400" />
        </h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
          Real-time usage metering, token tracking, and precise cost calculation for{" "}
          {renderModelList()}.
        </p>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 shrink-0">
        <span className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400">
          {activeKeyCount} Active {activeKeyCount === 1 ? "Key" : "Keys"}
        </span>
      </div>
    </div>
  );
}
