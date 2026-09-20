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
  Key,
  Terminal,
  ArrowRight,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

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

const SESSION_SNIPPET = `import meterix

# Initialize with your API key
meter = meterix.Client(api_key="mx_live_your_key_here")

# Wrap multi-call agents with session tracking
with meter.session("checkout-agent-001") as session:
    result1 = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Step 1"}]
    )
    session.log(result1)

    result2 = openai.chat.completions.create(
        model="gpt-4o", 
        messages=[{"role": "user", "content": "Step 2"}]
    )
    session.log(result2)
# Session automatically rolled up in dashboard ✓`;

/** Rich empty state for when no session data is available */
function SessionEmptyState({ onScrollToKeys }: { onScrollToKeys: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(SESSION_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <tr>
      <td colSpan={6} className="py-0">
        <div className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
          {/* Icon cluster */}
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Layers className="h-8 w-8 text-indigo-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-sm font-semibold text-zinc-100 font-sans">
              No agent sessions recorded yet
            </h3>
            <p className="text-xs text-zinc-500 font-sans leading-relaxed">
              Session rollups aggregate cost, latency, and model usage across
              multi-step agent tasks. Start logging with{" "}
              <code className="text-indigo-400 bg-indigo-950/40 px-1 py-0.5 rounded text-[10px] font-mono border border-indigo-900/50">
                meter.session(id)
              </code>{" "}
              to see data here.
            </p>
          </div>

          {/* Steps */}
          <div className="flex flex-col sm:flex-row items-center gap-2 text-[11px] font-mono text-zinc-500">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-indigo-400 font-bold">1</span>
              <Key className="h-3 w-3 text-zinc-500" />
              <span>Get API Key</span>
            </div>
            <ArrowRight className="h-3 w-3 text-zinc-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-indigo-400 font-bold">2</span>
              <Terminal className="h-3 w-3 text-zinc-500" />
              <span>Add session() wrapping</span>
            </div>
            <ArrowRight className="h-3 w-3 text-zinc-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-indigo-400 font-bold">3</span>
              <Activity className="h-3 w-3 text-zinc-500" />
              <span>Sessions appear live</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <button
              id="session-empty-generate-key-btn"
              onClick={onScrollToKeys}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold font-sans transition-all duration-200 shadow-md shadow-indigo-900/40 hover:shadow-indigo-700/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Key className="h-3.5 w-3.5" />
              Generate API Key
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </button>
            <button
              id="session-empty-copy-snippet-btn"
              onClick={handleCopySnippet}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-xs font-semibold font-sans transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Snippet Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Python Snippet
                </>
              )}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function SessionRollups() {
  const [sessions, setSessions] = useState<SessionRollupItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const toast = useToast();

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
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP ${res.status}: Failed to fetch agent session rollups.`;
        console.error("Could not fetch session rollups:", errMsg);
        toast.error(errMsg, "Session Rollups Error");
      }
    } catch (err: any) {
      const message = err?.message || "Failed to load agent session rollups. Please check your network connection.";
      console.error("Could not fetch session rollups:", err);
      toast.error(message, "Network Error");
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

  const handleScrollToKeys = () => {
    const el = document.getElementById("api-key-management-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
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
              searchQuery ? (
                <tr>
                  <td colSpan={6} className="py-0">
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                      <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <Search className="h-5 w-5 text-zinc-500" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-zinc-200 font-sans">
                          No matching sessions found
                        </h4>
                        <p className="text-xs text-zinc-500 font-sans">
                          No sessions found matching your search criteria.
                        </p>
                      </div>
                      <button
                        onClick={() => setSearchQuery("")}
                        className="mt-1 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-semibold font-sans transition-all duration-200"
                      >
                        <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                        Clear Search
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <SessionEmptyState onScrollToKeys={handleScrollToKeys} />
              )
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
