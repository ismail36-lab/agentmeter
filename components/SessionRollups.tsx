"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Layers,
  Clock,
  Cpu,
  DollarSign,
  Activity,
  RefreshCw,
  Search,
  Copy,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface SessionRollupItem {
  session_id: string;
  agent_name: string;
  total_cost: number;
  call_count: number;
  models_used: string[];
  start_time: string;
  end_time: string;
  duration_seconds: number;
}

function modelBadgeClass(model: string) {
  if (model === "gpt-4o")
    return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (model === "gpt-4o-mini")
    return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
  if (model === "gemini-1.5-pro" || model === "gemini-2.0-flash")
    return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  if (model === "gemini-1.5-flash")
    return "bg-pink-500/10 text-pink-400 border border-pink-500/20";
  return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "< 0.1s";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = (seconds % 60).toFixed(0);
  return `${mins}m ${remSecs}s`;
}

export function SessionRollups() {
  const [sessions, setSessions] = useState<SessionRollupItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSessionRollups = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/session-rollups", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
        }
      }
    } catch (err) {
      console.warn("Could not fetch session rollups:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionRollups();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(q) ||
        s.agent_name.toLowerCase().includes(q) ||
        s.models_used.some((m) => m.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  // Aggregate Session Stats
  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const multiCallSessions = sessions.filter((s) => s.call_count > 1).length;
    const totalCost = sessions.reduce((acc, s) => acc + s.total_cost, 0);
    const totalCalls = sessions.reduce((acc, s) => acc + s.call_count, 0);
    const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0;
    const avgCallsPerSession = totalSessions > 0 ? totalCalls / totalSessions : 0;
    const avgDuration =
      totalSessions > 0
        ? sessions.reduce((acc, s) => acc + s.duration_seconds, 0) / totalSessions
        : 0;

    return {
      totalSessions,
      multiCallSessions,
      totalCost,
      avgCostPerSession,
      avgCallsPerSession,
      avgDuration,
    };
  }, [sessions]);

  return (
    <div className="bento-card p-6 space-y-6 w-full border border-zinc-800/80 bg-zinc-900/90 font-sans">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50 flex items-center gap-2 tracking-tight">
            <Layers className="h-5 w-5 text-indigo-400" />
            Multi-Call Agent Session Rollups
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Aggregated cost, execution call counts, models used, and latency duration per multi-call agent task session.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchSessionRollups}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
            title="Refresh Session Rollups"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-indigo-400 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Total Sessions</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-indigo-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">{stats.totalSessions}</span>
            <span className="text-[11px] font-mono text-indigo-400">{stats.multiCallSessions} multi-call</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Avg Calls / Session</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-sky-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {stats.avgCallsPerSession.toFixed(1)}
            </span>
            <span className="text-[11px] font-mono text-sky-400">LLM Calls</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Avg Cost / Session</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              ${stats.avgCostPerSession.toFixed(5)}
            </span>
            <span className="text-[11px] font-mono text-emerald-400">USD</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Avg Duration</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {formatDuration(stats.avgDuration)}
            </span>
            <span className="text-[11px] font-mono text-amber-400">Seconds</span>
          </div>
        </div>
      </div>

      {/* ── Search Bar & Controls ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by Session ID or Agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-lg pl-9 pr-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500/60 font-mono transition-colors"
          />
        </div>

        <div className="text-xs text-zinc-500 font-mono">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </div>
      </div>

      {/* ── Session Rollups Table ──────────────────────────────── */}
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">Session ID</th>
              <th className="py-3 px-4 min-w-[9rem] whitespace-nowrap">Agent Name</th>
              <th className="py-3 px-4 whitespace-nowrap">LLM Calls</th>
              <th className="py-3 px-4 min-w-[12rem] whitespace-nowrap">Models Used</th>
              <th className="py-3 px-4 whitespace-nowrap">Duration</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Total Cost (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-indigo-400" />
                  Loading session rollups...
                </td>
              </tr>
            ) : filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono">
                  {searchQuery ? "No matching sessions found." : "No agent session rollups recorded yet. Use meter.session(sessionId) in your code to log session tasks!"}
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.session_id} className="hover:bg-zinc-900/50 transition-colors">
                  {/* Session ID */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-indigo-300 font-semibold bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                        {session.session_id}
                      </span>
                      <button
                        onClick={() => copyToClipboard(session.session_id, session.session_id)}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Copy Session ID"
                      >
                        {copiedId === session.session_id ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Agent Name */}
                  <td className="py-3 px-4 whitespace-nowrap font-sans font-semibold text-zinc-200">
                    {session.agent_name}
                  </td>

                  {/* Calls Count */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-200 font-semibold">{session.call_count}</span>
                      <span className="text-zinc-500 text-[10px] font-sans">
                        {session.call_count === 1 ? "call" : "calls"}
                      </span>
                      {session.call_count > 1 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          Multi-call
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Models Used */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1 items-center">
                      {session.models_used.map((model) => (
                        <span
                          key={model}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${modelBadgeClass(model)}`}
                        >
                          {model}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Duration */}
                  <td className="py-3 px-4 whitespace-nowrap text-zinc-400 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    <span>{formatDuration(session.duration_seconds)}</span>
                  </td>

                  {/* Total Cost */}
                  <td className="py-3 px-4 text-right whitespace-nowrap text-emerald-400 font-semibold font-mono">
                    ${session.total_cost.toFixed(6)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
