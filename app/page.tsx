"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Check,
  Zap,
  Shield,
  TrendingUp,
  Key,
  Clock,
  Webhook,
  HelpCircle,
  Loader2,
} from "lucide-react";

const getPlans = (billingCycle: "monthly" | "annual") => [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "/mo",
    subtitle: "Strict Sandbox",
    highlight: false,
    badge: null,
    cta: "Get Started",
    features: [
      { label: "1,000 logs / month", icon: TrendingUp },
      { label: "3-day data retention", icon: Clock },
      { label: "1 API Key", icon: Key },
      { label: "60 req / min rate limit", icon: Zap },
      { label: "Basic Dashboard Access", icon: Shield },
    ],
    limits: {
      logs: "1,000",
      retention: "3 days",
      keys: "1",
      rateLimit: "60 req/min",
      overage: "—",
      alerts: "—",
      support: "Community",
    },
  },
  {
    key: "pro",
    name: "Pro",
    price: billingCycle === "annual" ? "$79" : "$99",
    period: "/mo",
    subtitle: billingCycle === "annual" ? "Billed annually ($948/yr) · 20% Savings" : "Billed monthly · Cancel anytime",
    highlight: true,
    badge: "Most Popular",
    cta: "Start Pro Trial",
    features: [
      { label: "500,000 logs / month included", icon: TrendingUp },
      { label: "$0.10 / 1,000 extra logs (PAYG)", icon: Zap },
      { label: "30-day data retention", icon: Clock },
      { label: "Unlimited API Keys", icon: Key },
      { label: "1,000 req / min rate limit", icon: Shield },
      { label: "Webhook & Email Cost Alerts", icon: Webhook },
    ],
    limits: {
      logs: "500,000",
      retention: "30 days",
      keys: "Unlimited",
      rateLimit: "1,000 req/min",
      overage: "$0.10 / 1k logs",
      alerts: "Webhook & Email",
      support: "Priority Email",
    },
  },
];

const COMPARISON_ROWS = [
  { label: "Included Logs / month", key: "logs" },
  { label: "Data Retention", key: "retention" },
  { label: "API Keys", key: "keys" },
  { label: "Rate Limit", key: "rateLimit" },
  { label: "Overage Rate", key: "overage" },
  { label: "Cost Alerts", key: "alerts" },
  { label: "Support", key: "support" },
] as const;

export default function Home() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const plans = getPlans(billingCycle);

  const handleSelectPlan = async (planKey: string) => {
    // "Start Pro Trial" ($99/mo or $79/mo Plan) — check auth first, then call checkout
    if (planKey === "pro") {
      setLoadingPlan("pro");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user) {
          router.push(`/login?plan=pro&billing=${billingCycle}&checkout=pending`);
          return;
        }

        const res = await fetch(`/api/checkout?plan=pro&billing=${billingCycle}`);
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            window.location.href = data.url;
            return;
          }
        }
        window.location.href = `/api/checkout?plan=pro&billing=${billingCycle}`;
      } catch {
        window.location.href = `/api/checkout?plan=pro&billing=${billingCycle}`;
      } finally {
        setLoadingPlan(null);
      }
      return;
    }

    // "Get Started" (Free Plan) -> Redirects to /dashboard (or /login)
    setLoadingPlan("free");
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased w-full max-w-full overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-14 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <span className="font-bold text-sm tracking-tight text-zinc-50 font-mono">
            Meterix<span className="text-indigo-400">.</span>
          </span>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="text-xs text-zinc-400 hover:text-zinc-50 transition-colors font-sans">
              Pricing
            </a>
            <Link
              href="/login"
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-28 pb-16 px-4 sm:px-6 py-6 text-center max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-mono mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Now supporting OpenAI, Anthropic &amp; Gemini
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6 font-sans">
          LLM Cost Intelligence
          <br />
          <span className="text-indigo-400">At Every Request</span>
        </h1>
        <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-10 font-sans">
          Instrument any LLM API call with a single POST request. Meterix ingests token usage,
          calculates exact cost, and surfaces actionable analytics — so your team ships faster without
          the surprise invoices.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => handleSelectPlan("free")}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-sm"
          >
            Start for Free
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-sm transition-colors"
          >
            View Dashboard →
          </Link>
        </div>
      </section>

      {/* ── Pricing Cards ────────────────────────────────────── */}
      <section id="pricing" className="py-12 sm:py-16 px-4 sm:px-6 py-6 w-full">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-sm">
              Start free and scale as you grow. No hidden fees. No seat-based pricing — just usage.
            </p>
          </div>

          {/* Monthly / Annual Billing Toggle Switch */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <span className={`text-xs font-mono font-medium transition-colors ${billingCycle === "monthly" ? "text-zinc-100" : "text-zinc-500"}`}>
              Billed Monthly
            </span>
            <button
              type="button"
              onClick={() => setBillingCycle((prev) => (prev === "monthly" ? "annual" : "monthly"))}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-800 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
              role="switch"
              aria-checked={billingCycle === "annual"}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-indigo-500 shadow-lg ring-0 transition duration-200 ease-in-out ${
                  billingCycle === "annual" ? "translate-x-5 bg-indigo-400" : "translate-x-0 bg-zinc-400"
                }`}
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-mono font-medium transition-colors ${billingCycle === "annual" ? "text-zinc-100" : "text-zinc-500"}`}>
                Billed Annually
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                20% SAVINGS
              </span>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch w-full max-w-3xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-xl p-6 flex flex-col gap-6 border transition-all w-full ${
                  plan.highlight
                    ? "bg-zinc-900 border-indigo-500/60 ring-1 ring-indigo-500/30 shadow-xl shadow-black/40"
                    : "bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap border ${
                      plan.highlight
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-violet-950/80 text-violet-300 border-violet-800/60"
                    }`}
                  >
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div>
                  <p className="text-xs text-zinc-500 font-mono mb-1">{plan.name.toUpperCase()}</p>
                  <div className="flex items-baseline gap-1 font-mono">
                    <span className="text-3xl sm:text-4xl font-bold text-zinc-50">{plan.price}</span>
                    <span className="text-sm text-zinc-500">{plan.period}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 font-sans">{plan.subtitle}</p>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectPlan(plan.key)}
                  disabled={loadingPlan === plan.key}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    plan.highlight
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60"
                  }`}
                >
                  {loadingPlan === plan.key && <Loader2 className="h-4 w-4 animate-spin inline" />}
                  {plan.cta}
                </button>

                {/* Feature List */}
                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map(({ label, icon: Icon }) => (
                    <li key={label} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span
                        className={`mt-0.5 p-1 rounded-md shrink-0 ${
                          plan.highlight
                            ? "bg-indigo-950/80 text-indigo-400 border border-indigo-800/60"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700/40"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Comparison Grid ───────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 py-6 w-full max-w-4xl mx-auto">
        <div className="w-full">
          <h2 className="text-xl font-bold text-center mb-8 text-zinc-100">Full Feature Comparison</h2>
          <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-zinc-800">
                <tr>
                  <th className="py-4 px-6 text-zinc-500 font-medium w-1/3">Feature</th>
                  {plans.map((plan) => (
                    <th
                      key={plan.name}
                      className={`py-4 px-6 font-bold text-center ${
                        plan.highlight ? "text-indigo-400" : "text-zinc-200"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {COMPARISON_ROWS.map(({ label, key }) => (
                  <tr key={key} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-6 text-zinc-400 font-medium">{label}</td>
                    {plans.map((plan) => {
                      const val = plan.limits[key];
                      const isEmpty = val === "—";
                      const isBool = val === "✓";
                      return (
                        <td
                          key={plan.name}
                          className={`py-3.5 px-6 text-center font-mono text-xs ${
                            isEmpty
                              ? "text-zinc-700"
                              : plan.highlight
                              ? "text-indigo-300 font-semibold"
                              : "text-zinc-300"
                          }`}
                        >
                          {isEmpty ? (
                            <span className="text-zinc-700">—</span>
                          ) : isBool ? (
                            <Check className="h-4 w-4 text-indigo-400 mx-auto" />
                          ) : (
                            val
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ Teaser ─────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-xl font-bold text-center mb-8 text-zinc-100">Common Questions</h2>
          {[
            {
              q: "What counts as a log?",
              a: "Each POST request to /api/v1/telemetry counts as one log entry regardless of token count.",
            },
            {
              q: "How are overages billed?",
              a: "On Pro, each additional 1,000 logs beyond 500,000 included monthly logs is billed at $0.10 (PAYG).",
            },
            {
              q: "Can I switch billing cycles or plans anytime?",
              a: "Yes — upgrades are immediate. You can switch between monthly ($99/mo) and annual ($79/mo) billing at any time directly from your account.",
            },
            {
              q: "Do you support custom models?",
              a: "Yes. Meterix accepts any model name and will calculate costs if your model is in our pricing dictionary, or allow you to provide explicit cost values.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-5">
              <div className="flex gap-3">
                <HelpCircle className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-zinc-100 mb-1">{q}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-10 px-4 sm:px-6 font-mono text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-tight text-zinc-200 font-mono">
              Meterix<span className="text-indigo-400">.</span>
            </span>
            <span className="text-zinc-800">|</span>
            <p className="text-zinc-500 text-xs font-sans">
              Enterprise LLM Telemetry &amp; Cost Intelligence
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-zinc-400 text-xs font-sans">
            <Link href="/privacy" className="hover:text-zinc-200 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-zinc-200 transition-colors">
              Terms of Service
            </Link>
            <Link href="/dpa" className="hover:text-zinc-200 transition-colors">
              DPA
            </Link>
            <Link href="/docs" className="hover:text-zinc-200 transition-colors">
              Documentation
            </Link>
          </div>

          <div className="text-zinc-600 text-xs font-mono">
            © 2026 Meterix Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
