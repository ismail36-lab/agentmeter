"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CreditCard,
  User,
  ArrowRight,
  Key,
  Send,
  Zap,
  HelpCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

export interface CustomerMarginItem {
  user_id: string;
  email: string;
  stripe_customer_id: string | null;
  plan: string;
  revenue: number;
  total_cost: number;
  margin: number;
  margin_percentage: number;
  status: "unprofitable" | "low_margin" | "profitable" | "no_data" | "new_account";
  log_count: number;
  last_synced_at: string;
}

/** Rich empty state for when no customer margin data is available */
function CustomerEmptyState({ onSyncStripe, isSyncing }: { onSyncStripe: () => void; isSyncing: boolean }) {
  const handleScrollToTester = () => {
    const el = document.getElementById("ingestion-api-tester-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <tr>
      <td colSpan={6} className="py-0">
        <div className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
          {/* Icon cluster */}
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center">
              <DollarSign className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-sm font-semibold text-zinc-100 font-sans">
              No profitability data yet
            </h3>
            <p className="text-xs text-zinc-500 font-sans leading-relaxed">
              Revenue and margin data is calculated from your subscription plan and actual LLM usage costs.
              Start ingesting telemetry or sync with your billing provider to see margins here.
            </p>
          </div>

          {/* Steps */}
          <div className="flex flex-col sm:flex-row items-center gap-2 text-[11px] font-mono text-zinc-500">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-emerald-400 font-bold">1</span>
              <Send className="h-3 w-3 text-zinc-500" />
              <span>Send telemetry events</span>
            </div>
            <ArrowRight className="h-3 w-3 text-zinc-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-emerald-400 font-bold">2</span>
              <CreditCard className="h-3 w-3 text-zinc-500" />
              <span>Sync billing data</span>
            </div>
            <ArrowRight className="h-3 w-3 text-zinc-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-emerald-400 font-bold">3</span>
              <TrendingUp className="h-3 w-3 text-zinc-500" />
              <span>View margins live</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <button
              id="profitability-empty-sync-btn"
              onClick={onSyncStripe}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold font-sans transition-all duration-200 shadow-md shadow-emerald-900/40 hover:shadow-emerald-700/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              {isSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isSyncing ? "Syncing..." : "Sync Billing Revenue"}
            </button>
            <button
              id="profitability-empty-test-event-btn"
              onClick={handleScrollToTester}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-xs font-semibold font-sans transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Send className="h-3.5 w-3.5" />
              Send Test Event
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function CustomerProfitability() {
  const [customers, setCustomers] = useState<CustomerMarginItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const toast = useToast();

  const fetchCustomerMargins = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/customer-profitability", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.customers) {
          setCustomers(data.customers);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP ${res.status}: Failed to load customer profitability.`;
        console.error("Could not fetch customer profitability:", errMsg);
        toast.error(errMsg, "Profitability Data Error");
      }
    } catch (err: any) {
      const message = err?.message || "Could not fetch customer profitability. Please check your network connection.";
      console.error("Could not fetch customer profitability:", err);
      toast.error(message, "Network Error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncStripe = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/v1/cron/stripe-sync", { method: "POST", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.customers) {
          setCustomers(data.customers);
        }
        toast.success("Stripe revenue & margins synced successfully.", "Sync Complete");
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || errData.details || "Failed to sync Stripe revenue. Please check your network or API keys.";
        console.error("Error syncing Stripe revenue:", errMsg);
        toast.error(errMsg, "Stripe Sync Failed");
      }
    } catch (err: any) {
      const message = err?.message || "Failed to sync Stripe revenue. Please check your network or API keys.";
      console.error("Error syncing Stripe revenue:", err);
      toast.error(message, "Stripe Sync Failed");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchCustomerMargins();
  }, []);

  // Filtered & pre-sorted by lowest margin
  const filteredCustomers = useMemo(() => {
    const list = [...customers];
    // Always pre-sorted by lowest margin first
    list.sort((a, b) => a.margin - b.margin);

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.stripe_customer_id && c.stripe_customer_id.toLowerCase().includes(q)) ||
        c.plan.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  // Aggregate Stats
  const totals = useMemo(() => {
    const totalRev = customers.reduce((acc, c) => acc + c.revenue, 0);
    const totalCost = customers.reduce((acc, c) => acc + c.total_cost, 0);
    const netMargin = totalRev - totalCost;
    const netPercentage = totalRev > 0 ? (netMargin / totalRev) * 100 : 0;
    const unprofitableCount = customers.filter((c) => c.status === "unprofitable").length;
    const lowMarginCount = customers.filter((c) => c.status === "low_margin").length;

    return {
      totalRev,
      totalCost,
      netMargin,
      netPercentage,
      unprofitableCount,
      lowMarginCount,
    };
  }, [customers]);

  return (
    <div className="bento-card p-6 space-y-6 w-full border border-zinc-800/80 bg-zinc-900/90 font-sans">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50 flex items-center gap-2 tracking-tight">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Customer Profitability &amp; Margin Tracking
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time customer revenue vs LLM infra cost. Pre-sorted by lowest margin to highlight unprofitable users.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleSyncStripe}
            disabled={isSyncing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
            title="Sync Revenue from Stripe API"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing Stripe..." : "Sync Stripe Revenue"}</span>
          </button>
        </div>
      </div>

      {/* ── Summary Cards Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Total Customer Revenue</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-indigo-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">${totals.totalRev.toFixed(2)}</span>
            <span className="text-[11px] font-mono text-indigo-400">Stripe USD</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">LLM Infra Cost</span>
            <div className="p-1.5 rounded-lg bg-zinc-900 text-rose-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-100">${totals.totalCost.toFixed(2)}</span>
            <span className="text-[11px] font-mono text-rose-400">Usage Cost</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Net Profit Margin</span>
            <div className={`p-1.5 rounded-lg bg-zinc-900 ${totals.netMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className={`text-2xl font-bold font-mono ${totals.netMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ${totals.netMargin.toFixed(2)}
            </span>
            <span className={`text-[11px] font-mono ${totals.netMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {totals.netPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className={`p-4 rounded-xl bg-zinc-950/70 border flex flex-col justify-between ${totals.unprofitableCount > 0 ? "border-rose-900/60 bg-rose-950/20" : "border-zinc-800/80"}`}>
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Unprofitable Users</span>
            <div className={`p-1.5 rounded-lg bg-zinc-900 ${totals.unprofitableCount > 0 ? "text-rose-400" : "text-zinc-500"}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className={`text-2xl font-bold font-mono ${totals.unprofitableCount > 0 ? "text-rose-400" : "text-zinc-100"}`}>
              {totals.unprofitableCount}
            </span>
            <span className="text-[11px] font-mono text-zinc-500">Accounts</span>
          </div>
        </div>
      </div>

      {/* ── Search Bar & Controls ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search email, plan, customer ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-lg pl-9 pr-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500/60 font-mono transition-colors"
          />
        </div>

        <div className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Pre-sorted by Lowest Margin First</span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">Customer / Account</th>
              <th className="py-3 px-4 whitespace-nowrap">Stripe Customer ID</th>
              <th className="py-3 px-4 whitespace-nowrap">Revenue (USD)</th>
              <th className="py-3 px-4 whitespace-nowrap">LLM Cost (USD)</th>
              <th className="py-3 px-4 whitespace-nowrap">Net Margin (USD)</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-indigo-400" />
                  Loading customer margins...
                </td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              searchQuery ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono">
                    No matching customers found.
                  </td>
                </tr>
              ) : (
                <CustomerEmptyState onSyncStripe={handleSyncStripe} isSyncing={isSyncing} />
              )
            ) : (
              filteredCustomers.map((cust) => (
                <tr
                  key={cust.user_id}
                  className={`hover:bg-zinc-900/50 transition-colors ${
                    cust.status === "unprofitable" ? "bg-rose-950/10" : ""
                  }`}
                >
                  {/* Account / Email & Plan */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      <span className="font-sans font-semibold text-zinc-200">{cust.email}</span>
                      <span
                        className={`px-2 py-0.5 text-[9px] rounded font-bold font-mono border uppercase ${
                          cust.plan === "pro"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700/60"
                        }`}
                      >
                        {cust.plan}
                      </span>
                    </div>
                  </td>

                  {/* Stripe Customer ID */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {cust.stripe_customer_id ? (
                      <span className="font-mono text-xs bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                        {cust.stripe_customer_id}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-[11px]">N/A</span>
                    )}
                  </td>

                  {/* Revenue */}
                  <td className="py-3 px-4 whitespace-nowrap font-semibold text-zinc-200">
                    ${cust.revenue.toFixed(2)}
                  </td>

                  {/* Cost */}
                  <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                    ${cust.total_cost.toFixed(4)}
                  </td>

                  {/* Net Margin */}
                  <td className="py-3 px-4 whitespace-nowrap font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className={cust.margin < 0 ? "text-rose-400" : "text-emerald-400"}>
                        ${cust.margin.toFixed(2)}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          cust.margin < 0
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {cust.margin_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-4 whitespace-nowrap text-center">
                    {cust.status === "no_data" || cust.status === "new_account" || (cust.revenue === 0 && cust.total_cost === 0) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 font-sans">
                        <HelpCircle className="h-3 w-3 text-zinc-400" />
                        No Data Yet
                      </span>
                    ) : cust.status === "unprofitable" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 font-sans">
                        <AlertCircle className="h-3 w-3" />
                        Unprofitable
                      </span>
                    ) : cust.status === "low_margin" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-sans">
                        <AlertTriangle className="h-3 w-3" />
                        Low Margin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-sans">
                        <CheckCircle2 className="h-3 w-3" />
                        Profitable
                      </span>
                    )}
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
