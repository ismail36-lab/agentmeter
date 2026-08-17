"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  TrendingUp,
  BookOpen,
  CreditCard,
} from "lucide-react";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { ModelDistributionChart } from "@/components/charts/ModelDistributionChart";
import { ApiKeyManagement } from "@/components/ApiKeyManagement";
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

  // Plan & Tier Limits State
  const [planDetails, setPlanDetails] = useState<{
    plan: string;
    tierName: string;
    limit: number;
    limitLabel: string;
    usage: number;
    percentage: number;
    remaining: number;
  }>({
    plan: "free",
    tierName: "Free Sandbox",
    limit: 1000,
    limitLabel: "1,000 logs/mo",
    usage: 0,
    percentage: 0,
    remaining: 1000,
  });
  const [isSwitchingPlan, setIsSwitchingPlan] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  // Fetch Current Plan & Tier Usage
  const fetchPlanDetails = async () => {
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/plan", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.plan) {
          setPlanDetails(data);
        }
      }
    } catch (err) {
      console.warn("Could not fetch plan details:", err);
    }
  };

  // Toggle Plan between Free Sandbox & Pro Tier
  const handleTogglePlan = async () => {
    setIsSwitchingPlan(true);
    try {
      const newPlan = planDetails.plan === "pro" ? "free" : "pro";
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.plan) setPlanDetails(data);
      }
    } catch (err) {
      console.warn("Could not update plan:", err);
    } finally {
      setIsSwitchingPlan(false);
    }
  };

  // Open Stripe Customer Portal for billing management
  const handleManageBilling = async () => {
    setIsLoadingPortal(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/stripe/portal", { method: "POST", headers });
      const data = await res.json();

      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        console.warn("Billing portal error:", data.error);
      }
    } catch (err) {
      console.warn("Could not open billing portal:", err);
    } finally {
      setIsLoadingPortal(false);
    }
  };

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
        fetchPlanDetails();
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
              onClick={() => { fetchMetrics(); fetchLogs(userId); fetchApiKeys(); fetchPlanDetails(); }}
              disabled={isGlobalLoading}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-50 transition-colors"
              title="Refresh All Data"
            >
              <RefreshCw className={`h-4 w-4 ${isGlobalLoading ? "animate-spin text-emerald-400" : ""}`} />
            </button>

            {/* Developer Docs Link */}
            <Link
              href="/docs"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-zinc-50 transition-colors"
              title="Developer Documentation"
            >
              <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline font-medium">Docs</span>
            </Link>

            {/* User email chip & Plan badge */}
            {userEmail && (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                <User className="h-3.5 w-3.5 text-zinc-500" />
                <span className="font-mono max-w-[160px] truncate">{userEmail}</span>
                <span
                  className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono border ${
                    planDetails.plan === "pro"
                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80 shadow-sm"
                      : planDetails.plan === "enterprise"
                      ? "bg-violet-950/80 text-violet-400 border-violet-800/80 shadow-sm"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                  }`}
                >
                  {planDetails.plan === "pro"
                    ? "PRO TIER"
                    : planDetails.plan === "enterprise"
                    ? "ENTERPRISE"
                    : "FREE SANDBOX"}
                </span>
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

        {/* ── Tier Usage Progress Card ──────────────────────── */}
        <div className="bento-card p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-zinc-100">
                    Monthly Log Metering ({planDetails.tierName})
                  </h4>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono border ${
                      planDetails.plan === "pro"
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                        : planDetails.plan === "enterprise"
                        ? "bg-violet-950/80 text-violet-400 border-violet-800/80"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    {planDetails.limitLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  <span className="font-semibold text-zinc-200">{planDetails.usage.toLocaleString()}</span> of{" "}
                  <span className="font-semibold text-zinc-200">{planDetails.limit.toLocaleString()}</span> logs used this month ({planDetails.percentage}%)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Manage Billing — only visible to Pro subscribers with a Stripe customer */}
              {planDetails.plan === "pro" && (
                <button
                  id="manage-billing-btn"
                  onClick={handleManageBilling}
                  disabled={isLoadingPortal}
                  className="text-xs px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50 font-semibold transition-all flex items-center gap-2 shrink-0"
                  title="Open Stripe Customer Portal"
                >
                  {isLoadingPortal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                  Manage Billing
                </button>
              )}

              <button
                onClick={handleTogglePlan}
                disabled={isSwitchingPlan}
                className="text-xs px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 hover:text-emerald-300 font-semibold transition-all flex items-center gap-2 shrink-0"
              >
                {isSwitchingPlan && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {planDetails.plan === "pro" ? "Switch to Free Sandbox" : "Upgrade to Pro Tier ($49/mo)"}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800/80">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                planDetails.percentage >= 90
                  ? "bg-rose-500"
                  : planDetails.percentage >= 70
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${Math.max(2, planDetails.percentage)}%` }}
            />
          </div>

          {/* Limit-reached banner — only visible to free users at 100% */}
          {planDetails.plan === "free" && planDetails.percentage >= 100 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1 px-4 py-3 rounded-xl bg-rose-950/50 border border-rose-800/60">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-rose-300">Monthly limit reached</p>
                  <p className="text-xs text-rose-400/80 mt-0.5">
                    You've used all {planDetails.limit.toLocaleString()} free logs for this month.
                    New telemetry submissions will be blocked until you upgrade or the month resets.
                  </p>
                </div>
              </div>
              <a
                href="/api/checkout?plan=pro"
                id="upgrade-to-pro-banner-btn"
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors"
              >
                <Zap className="h-3.5 w-3.5" />
                Upgrade to Pro
              </a>
            </div>
          )}
        </div>

        {/* ── Subscription Overview Card ─────────────────────── */}
        <div className="bento-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">

            {/* Left — Plan identity + usage stats */}
            <div className="flex items-center gap-5">
              {/* Circular usage indicator */}
              <div className="relative h-20 w-20 shrink-0">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  {/* Track */}
                  <circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="7"
                    className="text-zinc-800"
                  />
                  {/* Fill */}
                  <circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - Math.min(planDetails.percentage, 100) / 100)}`}
                    className={`transition-all duration-700 ${
                      planDetails.percentage >= 90
                        ? "stroke-rose-500"
                        : planDetails.percentage >= 70
                        ? "stroke-amber-400"
                        : "stroke-emerald-400"
                    }`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-100">
                  {planDetails.percentage}%
                </span>
              </div>

              {/* Stats block */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">Subscription Overview</h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                      planDetails.plan === "pro"
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/60"
                        : planDetails.plan === "enterprise"
                        ? "bg-violet-950/80 text-violet-400 border-violet-800/60"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                    }`}
                  >
                    {planDetails.plan === "pro"
                      ? "PRO"
                      : planDetails.plan === "enterprise"
                      ? "ENTERPRISE"
                      : "FREE"}
                  </span>
                </div>

                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-100 font-semibold">{planDetails.usage.toLocaleString()}</span>
                  {" "}of{" "}
                  <span className="text-zinc-100 font-semibold">{planDetails.limit.toLocaleString()}</span>
                  {" "}logs used this month
                </p>
                <p className="text-xs text-zinc-500">
                  {planDetails.remaining.toLocaleString()} logs remaining · {planDetails.tierName}
                </p>

                {/* Mini progress bar */}
                <div className="w-48 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      planDetails.percentage >= 90
                        ? "bg-rose-500"
                        : planDetails.percentage >= 70
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.max(2, planDetails.percentage)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right — Action button */}
            <div className="flex flex-col gap-2 items-start sm:items-end shrink-0">
              {planDetails.plan === "pro" ? (
                <>
                  <button
                    id="manage-subscription-btn"
                    onClick={handleManageBilling}
                    disabled={isLoadingPortal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-all"
                  >
                    {isLoadingPortal ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    Manage Subscription
                  </button>
                  <p className="text-[10px] text-zinc-600 font-mono">
                    Invoices · Payment · Cancel
                  </p>
                </>
              ) : (
                <>
                  <a
                    href="/api/checkout?plan=pro"
                    id="subscription-overview-upgrade-btn"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Upgrade to Pro — $49/mo
                  </a>
                  <p className="text-[10px] text-zinc-600 font-mono">
                    250k logs/mo · Unlimited API keys
                  </p>
                </>
              )}
            </div>
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
            <ModelDistributionChart data={modelBreakdown} totalSpend={metrics.totalSpend} />
          </div>
        </div>

        {/* ── API Key Management Bento Card ─────────────────── */}
        <ApiKeyManagement
          apiKeys={apiKeys}
          isLoading={isLoadingKeys}
          onRefresh={fetchApiKeys}
          onKeyCreated={(newKey) => {
            setApiKeys((prev) => [newKey, ...prev]);
            setTestApiKey(newKey.key);
          }}
          onKeyRevoked={(keyId) => {
            setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
            if (testApiKey && apiKeys.find((k) => k.id === keyId)?.key === testApiKey) {
              const remaining = apiKeys.filter((k) => k.id !== keyId);
              setTestApiKey(remaining.length > 0 ? remaining[0].key : "");
            }
          }}
        />

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
