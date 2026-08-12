"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  Cpu,
  Activity,
  Zap,
  RefreshCw,
  Send,
  CheckCircle2,
  Copy,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  Terminal,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabase";

interface UsageLog {
  id: string;
  created_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  api_key?: string;
  metadata?: any;
}

const INITIAL_LOGS: UsageLog[] = [
  {
    id: "log_01",
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    model: "gpt-4o",
    prompt_tokens: 1250,
    completion_tokens: 480,
    total_tokens: 1730,
    cost: 0.007925,
    api_key: "am_test_sk...",
    metadata: { agent: "CustomerSupport" },
  },
  {
    id: "log_02",
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    model: "claude-3-5-sonnet",
    prompt_tokens: 2100,
    completion_tokens: 1150,
    total_tokens: 3250,
    cost: 0.02355,
    api_key: "am_test_sk...",
    metadata: { agent: "CodeReviewer" },
  },
  {
    id: "log_03",
    created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    model: "gpt-4o-mini",
    prompt_tokens: 3400,
    completion_tokens: 920,
    total_tokens: 4320,
    cost: 0.001062,
    api_key: "am_test_sk...",
    metadata: { agent: "Classifier" },
  },
  {
    id: "log_04",
    created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    model: "gpt-4o",
    prompt_tokens: 4120,
    completion_tokens: 890,
    total_tokens: 5010,
    cost: 0.0192,
    api_key: "am_test_sk...",
    metadata: { agent: "DocSummarizer" },
  },
  {
    id: "log_05",
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    model: "claude-3-5-sonnet",
    prompt_tokens: 1850,
    completion_tokens: 640,
    total_tokens: 2490,
    cost: 0.01515,
    api_key: "am_test_sk...",
    metadata: { agent: "DataExtractor" },
  },
];

const DAILY_TREND_INITIAL = [
  { date: "Aug 06", spend: 12.4, tokens: 1850000 },
  { date: "Aug 07", spend: 18.2, tokens: 2420000 },
  { date: "Aug 08", spend: 15.8, tokens: 2100000 },
  { date: "Aug 09", spend: 24.5, tokens: 3600000 },
  { date: "Aug 10", spend: 29.1, tokens: 4120000 },
  { date: "Aug 11", spend: 34.6, tokens: 4890000 },
  { date: "Aug 12", spend: 41.8, tokens: 5780000 },
];

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#10b981",          // emerald-500
  "gpt-4o-mini": "#0ea5e9",     // sky-500
  "claude-3-5-sonnet": "#8b5cf6", // violet-500
  other: "#f59e0b",             // amber-500
};

/* ─── Model badge helper ────────────────────────────────────── */
function modelBadgeClass(model: string) {
  if (model === "gpt-4o")
    return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (model === "gpt-4o-mini")
    return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
  return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
}

export default function Dashboard() {
  const [logs, setLogs] = useState<UsageLog[]>(INITIAL_LOGS);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilterModel, setSelectedFilterModel] = useState<string>("all");
  const [copiedKey, setCopiedKey] = useState(false);

  // Playground State
  const [testModel, setTestModel] = useState<string>("gpt-4o");
  const [testPromptTokens, setTestPromptTokens] = useState<number>(1500);
  const [testCompletionTokens, setTestCompletionTokens] = useState<number>(450);
  const [testApiKey, setTestApiKey] = useState<string>("am_test_sk_9918237192");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Fetch telemetry from Supabase
  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("usage_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        setLogs(data);
      }
    } catch (err) {
      console.warn("Could not fetch from Supabase usage_logs directly:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    const totalSpend = logs.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const totalTokens = logs.reduce((acc, curr) => acc + (curr.total_tokens || 0), 0);
    const totalRequests = logs.length;

    const modelCounts: Record<string, number> = {};
    logs.forEach((log) => {
      modelCounts[log.model] = (modelCounts[log.model] || 0) + (log.cost || 0);
    });

    let topModel = "gpt-4o";
    let maxSpend = -1;
    Object.entries(modelCounts).forEach(([m, s]) => {
      if (s > maxSpend) { maxSpend = s; topModel = m; }
    });

    return { totalSpend, totalTokens, totalRequests, topModel };
  }, [logs]);

  // Model Breakdown for Donut Chart
  const modelBreakdownData = useMemo(() => {
    const map: Record<string, number> = {
      "gpt-4o": 0,
      "gpt-4o-mini": 0,
      "claude-3-5-sonnet": 0,
    };

    logs.forEach((log) => {
      const key = log.model in map ? log.model : "other";
      map[key] = (map[key] || 0) + (log.cost || 0);
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(5)),
      color: MODEL_COLORS[name] || MODEL_COLORS.other,
    }));
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (selectedFilterModel === "all") return logs;
    return logs.filter(
      (log) => log.model.toLowerCase() === selectedFilterModel.toLowerCase()
    );
  }, [logs, selectedFilterModel]);

  // Send Test Telemetry to Ingestion API
  const handleSendTestTelemetry = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          prompt_tokens: testPromptTokens,
          completion_tokens: testCompletionTokens,
          metadata: { source: "Dashboard Playground", agent: "InteractiveTester" },
        }),
      });

      const data = await res.json();
      setTestResult(data);

      if (res.ok && data.success) {
        const newLog: UsageLog = {
          id: data.log_id,
          created_at: data.timestamp || new Date().toISOString(),
          model: data.model,
          prompt_tokens: data.prompt_tokens,
          completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          cost: data.calculated_cost,
          api_key: testApiKey.slice(0, 8) + "...",
          metadata: { source: "Dashboard Playground" },
        };
        setLogs((prev) => [newLog, ...prev]);
      }
    } catch (err: any) {
      setTestResult({ error: "Request Failed", details: err.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const copyKeyToClipboard = () => {
    navigator.clipboard.writeText(testApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 flex flex-col font-sans selection:bg-emerald-500/20">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight text-zinc-50">
                AgentMeter
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                v1.0.0
              </span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono">Ingestion API Active</span>
            </div>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-50 transition-colors"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Banner ─────────────────────────────────────────── */}
        <div className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-50 flex items-center gap-2">
              LLM Telemetry &amp; Cost Analytics
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Real-time usage metering, token tracking, and precise cost calculation for{" "}
              <code className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/60 font-mono text-xs">
                gpt-4o
              </code>
              ,{" "}
              <code className="text-sky-400 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-900/60 font-mono text-xs">
                gpt-4o-mini
              </code>
              , and{" "}
              <code className="text-violet-400 bg-violet-950/40 px-1.5 py-0.5 rounded border border-violet-900/60 font-mono text-xs">
                claude-3-5-sonnet
              </code>
              .
            </p>
          </div>

          {/* API key chip */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-400 shrink-0">
            <span className="text-zinc-600">KEY:</span>
            <span className="text-zinc-300">{testApiKey.slice(0, 15)}…</span>
            <button
              onClick={copyKeyToClipboard}
              className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-50 transition-colors"
              title="Copy API Key"
            >
              {copiedKey
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Metric Cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Total Spend */}
          <div className="bento-card bento-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Spend</span>
              <div className="p-2 rounded-lg bg-zinc-800/80 text-emerald-400 border border-zinc-700/60">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-zinc-50 tracking-tight">
                ${metrics.totalSpend.toFixed(4)}
              </span>
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-0.5">
                +14.2% <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Calculated real-time LLM cost</p>
          </div>

          {/* Total Tokens */}
          <div className="bento-card bento-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Tokens</span>
              <div className="p-2 rounded-lg bg-zinc-800/80 text-sky-400 border border-zinc-700/60">
                <Cpu className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-zinc-50 tracking-tight">
                {metrics.totalTokens.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-sky-400">Tokens processed</span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Prompt + completion tokens</p>
          </div>

          {/* API Ingestions */}
          <div className="bento-card bento-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">API Ingestions</span>
              <div className="p-2 rounded-lg bg-zinc-800/80 text-violet-400 border border-zinc-700/60">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-zinc-50 tracking-tight">
                {metrics.totalRequests}
              </span>
              <span className="text-xs font-medium text-violet-400">Logs recorded</span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Telemetry logs in database</p>
          </div>

          {/* Top Model */}
          <div className="bento-card bento-card-hover p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Top Model</span>
              <div className="p-2 rounded-lg bg-zinc-800/80 text-amber-400 border border-zinc-700/60">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xl font-bold font-mono text-zinc-50 truncate block">
                {metrics.topModel}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-600">Highest aggregate spend model</p>
          </div>
        </div>

        {/* ── Charts Row ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Area Chart */}
          <div className="lg:col-span-2 bento-card p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  Daily Spend Analytics
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Cumulative spend progression (USD)</p>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                Last 7 Days
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={DAILY_TREND_INITIAL} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}  />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#3f3f46",
                      borderRadius: "0.75rem",
                      color: "#fafafa",
                      fontSize: "12px",
                    }}
                    formatter={(val: any) => [`$${val}`, "Spend"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#spendGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart */}
          <div className="bento-card p-6 flex flex-col">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
                <Layers className="h-4 w-4 text-sky-400" />
                Model Cost Breakdown
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">Share of total spend by LLM model</p>
            </div>

            <div className="h-52 w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modelBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {modelBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#121214" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#3f3f46",
                      borderRadius: "0.75rem",
                      color: "#fafafa",
                      fontSize: "12px",
                    }}
                    formatter={(val: any) => [`$${val}`, "Cost"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</span>
                <span className="text-base font-bold text-zinc-50">${metrics.totalSpend.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {modelBreakdownData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-zinc-400">{item.name}</span>
                  </div>
                  <span className="text-zinc-500">${item.value.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Playground + Table ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* API Tester */}
          <div className="bento-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Ingestion API Tester
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                POST /api/v1/telemetry
              </span>
            </div>

            <p className="text-xs text-zinc-500">
              Send test telemetry payload to verify real-time pricing and database insertion.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-zinc-500 mb-1">Target Model</label>
                <select
                  value={testModel}
                  onChange={(e) => setTestModel(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                >
                  <option value="gpt-4o">gpt-4o ($2.50 / $10.00 per 1M)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini ($0.15 / $0.60 per 1M)</option>
                  <option value="claude-3-5-sonnet">claude-3-5-sonnet ($3.00 / $15.00 per 1M)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-500 mb-1">Prompt Tokens</label>
                  <input
                    type="number"
                    value={testPromptTokens}
                    onChange={(e) => setTestPromptTokens(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-zinc-500 mb-1">Completion Tokens</label>
                  <input
                    type="number"
                    value={testCompletionTokens}
                    onChange={(e) => setTestCompletionTokens(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
              </div>

              <button
                onClick={handleSendTestTelemetry}
                disabled={isSendingTest}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 hover:border-zinc-600 text-zinc-50 font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSendingTest ? "Sending…" : "Send Telemetry"}</span>
              </button>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono space-y-1">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>API Response:</span>
                  <span className={testResult.success ? "text-emerald-400" : "text-red-400"}>
                    {testResult.success ? "200 OK" : "Error"}
                  </span>
                </div>
                <pre className="text-zinc-300 overflow-x-auto p-1 max-h-32">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Telemetry Table */}
          <div className="lg:col-span-2 bento-card p-6 space-y-4 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-violet-400" />
                  Live Telemetry Activity Log
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Recent API logs ingested into Supabase usage_logs</p>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-zinc-500" />
                <select
                  value={selectedFilterModel}
                  onChange={(e) => setSelectedFilterModel(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
                >
                  <option value="all">All Models</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/60">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900/60 text-zinc-500 uppercase tracking-wider text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4 whitespace-nowrap">Time</th>
                    <th className="py-3 px-4 min-w-[10rem] whitespace-nowrap">Model</th>
                    <th className="py-3 px-4 whitespace-nowrap">Prompt</th>
                    <th className="py-3 px-4 whitespace-nowrap">Completion</th>
                    <th className="py-3 px-4 whitespace-nowrap">Total Tokens</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredLogs.slice(0, 10).map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-4 text-zinc-500 whitespace-nowrap" suppressHydrationWarning>
                        {new Date(log.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center whitespace-nowrap shrink-0 max-w-full px-2.5 py-1 rounded-full text-[10px] font-semibold ${modelBadgeClass(log.model)}`}
                        >
                          {log.model}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-500">{log.prompt_tokens?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-zinc-500">{log.completion_tokens?.toLocaleString()}</td>
                      <td className="py-3 px-4 font-semibold text-zinc-200">
                        {log.total_tokens?.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-400 font-semibold">
                        ${log.cost ? log.cost.toFixed(6) : "0.000000"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 py-5 text-center text-xs text-zinc-600 font-mono">
        AgentMeter Telemetry Infrastructure • Powered by Next.js 14 &amp; Supabase
      </footer>
    </div>
  );
}
