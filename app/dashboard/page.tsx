"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  ShieldCheck,
  Layers,
  Terminal,
  Clock,
  LogOut,
  User,
  Key,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { ModelDistributionChart } from "@/components/charts/ModelDistributionChart";
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

interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at: string;
}

interface UsageLog {
  id: string;
  created_at: string;
  timestamp?: string;
  model: string;
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
  total_cost_usd?: number;
  is_estimated?: boolean;
  api_key?: string;
  user_id?: string;
  metadata?: any;
}

interface MetricsData {
  totalSpend: number;
  totalTokens: number;
  totalRequests: number;
  topModel: string;
}

interface DailyTrendItem {
  date: string;
  spend: number;
  tokens: number;
}

interface ModelBreakdownItem {
  name: string;
  value: number;
  color: string;
}

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#10b981",          // emerald-500
  "gpt-4o-mini": "#0ea5e9",     // sky-500
  "claude-3-5-sonnet": "#8b5cf6", // violet-500
  other: "#f59e0b",             // amber-500
};

function modelBadgeClass(model: string) {
  if (model === "gpt-4o")
    return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (model === "gpt-4o-mini")
    return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
  return "bg-violet-500/10 text-violet-400 border border-violet-500/20";
}

export default function Dashboard() {
  const router = useRouter();

  // Auth State
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Data Loading States
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // Metrics & Chart Data State
  const [metrics, setMetrics] = useState<MetricsData>({
    totalSpend: 0,
    totalTokens: 0,
    totalRequests: 0,
    topModel: "N/A",
  });
  const [dailyTrend, setDailyTrend] = useState<DailyTrendItem[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdownItem[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [selectedFilterModel, setSelectedFilterModel] = useState<string>("all");

  // API Key Management State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});

  // Playground / Ingestion API Tester State
  const [testModel, setTestModel] = useState<string>("gpt-4o");
  const [testPromptTokens, setTestPromptTokens] = useState<number>(1500);
  const [testCompletionTokens, setTestCompletionTokens] = useState<number>(450);
  const [testApiKey, setTestApiKey] = useState<string>("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // 1. Fetch User API Keys
  const fetchApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/keys", { headers });
      if (res.ok) {
        const data = await res.json();
        const activeKeys = (data.keys || []).filter((k: ApiKeyItem) => k.is_active);
        setApiKeys(activeKeys);

        // Auto-select first key for playground if testApiKey is empty
        if (activeKeys.length > 0 && !testApiKey) {
          setTestApiKey(activeKeys[0].key);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch API keys:", err);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  // 2. Fetch Calculated Metrics & Chart Data from API
  const fetchMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/metrics", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) setMetrics(data.metrics);
        const trends = data.daily_trends || data.dailyTrend;
        if (trends) setDailyTrend(trends);
        const breakdown = data.model_breakdown || data.modelBreakdown;
        if (breakdown) setModelBreakdown(breakdown);
      }
    } catch (err) {
      console.warn("Failed to fetch metrics:", err);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  // 3. Fetch Raw Telemetry Logs for Table
  const fetchLogs = async (uid?: string | null) => {
    setIsLoadingLogs(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // 1. Fetch via /api/logs API route with cache bypass
      const res = await fetch("/api/logs", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
          setIsLoadingLogs(false);
          return;
        }
      }

      // 2. Direct Supabase client query fallback for telemetry_logs
      const activeUid = uid ?? userId;
      let { data, error } = await supabase
        .from("telemetry_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error || !data || data.length === 0) {
        const uRes = await supabase
          .from("usage_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (!uRes.error && uRes.data) {
          data = uRes.data;
          error = null;
        }
      }

      if (!error && data) {
        const filtered = activeUid
          ? data.filter((l: any) => !l.user_id || l.user_id === activeUid)
          : data;
        setLogs(filtered);
      }
    } catch (err) {
      console.warn("Could not fetch telemetry logs:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Bootstrap session check & load data
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
        fetchApiKeys();
        fetchMetrics();
        fetchLogs(user.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Create API Key
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingKey(true);
    setKeyError(null);
    setNewlyCreatedKey(null);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || "Default Key" }),
      });

      const data = await res.json();
      if (!res.ok) {
        setKeyError(data.error || "Failed to create key");
        return;
      }

      if (data.key) {
        setNewlyCreatedKey(data.key.key);
        setTestApiKey(data.key.key); // Auto select new key in tester
        setNewKeyName("");
        await fetchApiKeys();
      }
    } catch (err: any) {
      setKeyError(err.message || "Failed to create key");
    } finally {
      setIsCreatingKey(false);
    }
  };

  // Handle Revoke API Key
  const handleRevokeKey = async (keyId: string) => {
    setRevokingKeyId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (res.ok) {
        setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
        if (testApiKey && apiKeys.find((k) => k.id === keyId)?.key === testApiKey) {
          const remaining = apiKeys.filter((k) => k.id !== keyId);
          setTestApiKey(remaining.length > 0 ? remaining[0].key : "");
        }
      }
    } catch (err) {
      console.warn("Failed to revoke key:", err);
    } finally {
      setRevokingKeyId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered Logs for Table
  const filteredLogs = useMemo(() => {
    if (selectedFilterModel === "all") return logs;
    return logs.filter(
      (log) => log.model.toLowerCase() === selectedFilterModel.toLowerCase()
    );
  }, [logs, selectedFilterModel]);

  // Handle Ingestion API Test Payload Submission
  const handleSendTestTelemetry = async () => {
    if (!testApiKey) {
      setTestResult({ error: "No API key selected. Please generate an API Key first." });
      return;
    }

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
        // Refetch logs and metrics so charts update live
        await fetchMetrics();
        await fetchLogs(userId);
      }
    } catch (err: any) {
      setTestResult({ error: "Request Failed", details: err.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const isGlobalLoading = isLoadingLogs || isLoadingMetrics;

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
              onClick={() => { fetchMetrics(); fetchLogs(userId); fetchApiKeys(); }}
              disabled={isGlobalLoading}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-50 transition-colors"
              title="Refresh All Data"
            >
              <RefreshCw className={`h-4 w-4 ${isGlobalLoading ? "animate-spin text-emerald-400" : ""}`} />
            </button>

            {/* User email chip */}
            {userEmail && (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                <User className="h-3.5 w-3.5 text-zinc-500" />
                <span className="font-mono max-w-[160px] truncate">{userEmail}</span>
              </div>
            )}

            {/* Sign Out button */}
            <button
              id="sign-out-btn"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-50 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header Banner ──────────────────────────────────── */}
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

          <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 shrink-0">
            <span className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400">
              {apiKeys.length} Active {apiKeys.length === 1 ? "Key" : "Keys"}
            </span>
          </div>
        </div>

        {/* ── Metric Cards Row ───────────────────────────────── */}
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
                USD
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Real-time aggregate LLM cost</p>
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
              <span className="text-xs font-medium text-sky-400">Tokens</span>
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
              <span className="text-xs font-medium text-violet-400">Logs</span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Recorded telemetry logs</p>
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
            <p className="mt-2 text-xs text-zinc-600">Highest spend model</p>
          </div>
        </div>

        {/* ── Visual Charts Row ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageTrendChart data={dailyTrend} />
          </div>
          <div className="lg:col-span-1">
            <ModelDistributionChart data={modelBreakdown} />
          </div>
        </div>

        {/* ── API Key Management Bento Card ─────────────────── */}
        <div className="bento-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2">
                <Key className="h-4 w-4 text-emerald-400" />
                API Key Management
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Generate and manage secret keys to send LLM telemetry payloads to AgentMeter.
              </p>
            </div>
          </div>

          {/* Create key form */}
          <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Key label (e.g., Production Agent, Staging)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 transition-all font-mono"
            />
            <button
              type="submit"
              disabled={isCreatingKey}
              className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-40"
            >
              {isCreatingKey ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Generate New Key</span>
                </>
              )}
            </button>
          </form>

          {/* Error notice */}
          {keyError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{keyError}</span>
            </div>
          )}

          {/* Newly created key banner */}
          {newlyCreatedKey && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between text-emerald-400 font-semibold">
                <span>Secret Key Generated Successfully!</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newlyCreatedKey, "new_created_key")}
                  className="p-1 rounded bg-emerald-950/60 text-emerald-300 hover:text-emerald-100 flex items-center gap-1"
                >
                  {copiedKeyId === "new_created_key" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Full Key</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-zinc-300 break-all bg-zinc-950/80 p-2 rounded-lg border border-zinc-800 text-[11px]">
                {newlyCreatedKey}
              </p>
              <p className="text-zinc-500 text-[10px]">
                Copy this key now. For security, full keys are hidden after creation.
              </p>
            </div>
          )}

          {/* Keys list table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/60">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/60 text-zinc-500 uppercase tracking-wider text-[10px] border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Key Name</th>
                  <th className="py-3 px-4">Secret Key</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {isLoadingKeys ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-emerald-400" />
                      Loading API keys…
                    </td>
                  </tr>
                ) : apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-zinc-500">
                      No active API keys found. Click &quot;Generate New Key&quot; above to create one.
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((item) => {
                    const isVisible = Boolean(visibleKeyIds[item.id]);
                    const displayKey = isVisible
                      ? item.key
                      : item.key.slice(0, 10) + "••••••••••••••••••••";

                    return (
                      <tr key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-zinc-200">{item.name}</td>
                        <td className="py-3 px-4 text-zinc-400 font-mono">
                          <div className="flex items-center gap-2">
                            <span>{displayKey}</span>
                            <button
                              type="button"
                              onClick={() => toggleKeyVisibility(item.id)}
                              className="text-zinc-600 hover:text-zinc-300 transition-colors"
                              title={isVisible ? "Hide Key" : "Show Key"}
                            >
                              {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-500">
                          {new Date(item.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.key, item.id)}
                              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-50 transition-colors border border-zinc-800"
                              title="Copy Key"
                            >
                              {copiedKeyId === item.id ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeKey(item.id)}
                              disabled={revokingKeyId === item.id}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-500/20 disabled:opacity-40"
                              title="Revoke Key"
                            >
                              {revokingKeyId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
                <p className="text-xs text-zinc-500 mt-0.5">Real-time spend progression (USD) from Supabase logs</p>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                Last 7 Days
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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
                    data={modelBreakdown.length > 0 ? modelBreakdown : [{ name: "No data", value: 1, color: "#27272a" }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {(modelBreakdown.length > 0 ? modelBreakdown : [{ name: "No data", value: 1, color: "#27272a" }]).map((entry, index) => (
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
              {modelBreakdown.map((item) => (
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
              Send test telemetry payload using your API key to verify pricing and live database insertion.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-zinc-500 mb-1">API Key to Use</label>
                <select
                  value={testApiKey}
                  onChange={(e) => setTestApiKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                >
                  {apiKeys.length === 0 ? (
                    <option value="">No keys available — Generate key above</option>
                  ) : (
                    apiKeys.map((k) => (
                      <option key={k.id} value={k.key}>
                        {k.name} ({k.key.slice(0, 10)}…)
                      </option>
                    ))
                  )}
                </select>
              </div>

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
                disabled={isSendingTest || !testApiKey}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 hover:border-zinc-600 text-zinc-50 font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                {isSendingTest ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending…</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Telemetry</span>
                  </>
                )}
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
                  {isLoadingLogs ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-emerald-400" />
                        Loading telemetry logs…
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-500">
                        No telemetry logs found. Generate an API key above and send a test payload!
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.slice(0, 15).map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-4 text-zinc-500 whitespace-nowrap" suppressHydrationWarning>
                          {new Date(log.created_at || log.timestamp || Date.now()).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center whitespace-nowrap shrink-0 max-w-full px-2.5 py-1 rounded-full text-[10px] font-semibold ${modelBadgeClass(log.model)}`}
                            >
                              {log.model}
                            </span>
                            {log.is_estimated && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-950/70 text-amber-400 border border-amber-800/60 font-sans tracking-wide">
                                Estimated
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-500">
                          {(log.prompt_tokens ?? log.input_tokens ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-zinc-500">
                          {(log.completion_tokens ?? log.output_tokens ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-200">
                          {(log.total_tokens ?? ((log.prompt_tokens ?? log.input_tokens ?? 0) + (log.completion_tokens ?? log.output_tokens ?? 0))).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-semibold">
                          ${Number(log.cost ?? log.total_cost_usd ?? 0).toFixed(6)}
                        </td>
                      </tr>
                    ))
                  )}
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
