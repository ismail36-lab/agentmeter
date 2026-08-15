import Link from "next/link";
import {
  Check,
  Zap,
  Shield,
  TrendingUp,
  Key,
  Clock,
  Webhook,
  Users,
  HelpCircle,
} from "lucide-react";

export const metadata = {
  title: "AgentMeter — LLM Usage Metering & Cost Intelligence",
  description:
    "Real-time token tracking, precise cost attribution, and usage metering for every LLM API call across OpenAI, Anthropic, and Gemini.",
};

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    subtitle: "Strict Sandbox",
    highlight: false,
    badge: null,
    cta: "Get Started",
    ctaHref: "/login",
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
      sla: "—",
      rbac: "—",
    },
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    subtitle: "For Teams Building AI Products",
    highlight: true,
    badge: "Most Popular",
    cta: "Start Pro Trial",
    ctaHref: "/login",
    features: [
      { label: "250,000 logs / month included", icon: TrendingUp },
      { label: "$0.10 / 1,000 extra logs (PAYG)", icon: Zap },
      { label: "30-day data retention", icon: Clock },
      { label: "Unlimited API Keys", icon: Key },
      { label: "1,000 req / min rate limit", icon: Shield },
      { label: "Webhook & Email Cost Alerts", icon: Webhook },
    ],
    limits: {
      logs: "250,000",
      retention: "30 days",
      keys: "Unlimited",
      rateLimit: "1,000 req/min",
      overage: "$0.10 / 1k logs",
      alerts: "Webhook & Email",
      sla: "—",
      rbac: "—",
    },
  },
  {
    name: "Enterprise",
    price: "$299",
    period: "/mo",
    subtitle: "Starting — Custom Pricing Available",
    highlight: false,
    badge: "Best Value at Scale",
    cta: "Talk to Sales",
    ctaHref: "mailto:sales@agentmeter.io",
    features: [
      { label: "1,000,000+ logs / month (Volume Discounts)", icon: TrendingUp },
      { label: "$0.05 / 1,000 extra logs (negotiated)", icon: Zap },
      { label: "90-day to 1-year data retention", icon: Clock },
      { label: "Unlimited API Keys", icon: Key },
      { label: "Dedicated Uptime SLA", icon: Shield },
      { label: "Dedicated Slack Support Channel", icon: Users },
      { label: "Custom Webhooks & RBAC Team Roles", icon: Webhook },
    ],
    limits: {
      logs: "1,000,000+",
      retention: "90 days – 1 year",
      keys: "Unlimited",
      rateLimit: "Custom",
      overage: "$0.05 / 1k logs",
      alerts: "Custom Webhooks",
      sla: "Dedicated SLA",
      rbac: "Full RBAC",
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
  { label: "Uptime SLA", key: "sla" },
  { label: "Role-Based Access (RBAC)", key: "rbac" },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-sm tracking-tight text-zinc-50 font-mono">
            AgentMeter<span className="text-emerald-400">.</span>
          </span>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="text-xs text-zinc-400 hover:text-zinc-50 transition-colors">
              Pricing
            </a>
            <Link
              href="/login"
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-28 pb-20 px-4 sm:px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 text-xs font-mono mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Now supporting OpenAI, Anthropic & Gemini
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          LLM Cost Intelligence
          <br />
          <span className="text-emerald-400">At Every Request</span>
        </h1>
        <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-10">
          Instrument any LLM API call with a single POST request. AgentMeter ingests token usage,
          calculates exact cost, and surfaces actionable analytics — so your team ships faster without
          the surprise invoices.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all hover:shadow-lg hover:shadow-emerald-500/20"
          >
            Start for Free
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold text-sm transition-colors"
          >
            View Dashboard →
          </Link>
        </div>
      </section>

      {/* ── Pricing Cards ────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-sm">
              Start free and scale as you grow. No hidden fees. No seat-based pricing — just usage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 flex flex-col gap-6 border transition-all ${
                  plan.highlight
                    ? "bg-zinc-900 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-xl shadow-emerald-900/20"
                    : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap border ${
                      plan.highlight
                        ? "bg-emerald-500 text-zinc-950 border-emerald-400"
                        : "bg-violet-900/70 text-violet-300 border-violet-700/60"
                    }`}
                  >
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div>
                  <p className="text-xs text-zinc-500 font-mono mb-1">{plan.name.toUpperCase()}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-zinc-50">{plan.price}</span>
                    <span className="text-sm text-zinc-500">{plan.period}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{plan.subtitle}</p>
                </div>

                {/* CTA */}
                <Link
                  href={plan.ctaHref}
                  className={`w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    plan.highlight
                      ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-900/30"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60"
                  }`}
                >
                  {plan.cta}
                </Link>

                {/* Feature List */}
                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map(({ label, icon: Icon }) => (
                    <li key={label} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span
                        className={`mt-0.5 p-1 rounded-md shrink-0 ${
                          plan.highlight
                            ? "bg-emerald-950/70 text-emerald-400 border border-emerald-900/60"
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
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-8 text-zinc-100">Full Feature Comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-zinc-800">
                <tr>
                  <th className="py-4 px-6 text-zinc-500 font-medium w-1/4">Feature</th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.name}
                      className={`py-4 px-6 font-bold text-center ${
                        plan.highlight ? "text-emerald-400" : "text-zinc-200"
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
                    {PLANS.map((plan) => {
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
                              ? "text-emerald-300 font-semibold"
                              : "text-zinc-300"
                          }`}
                        >
                          {isEmpty ? (
                            <span className="text-zinc-700">—</span>
                          ) : isBool ? (
                            <Check className="h-4 w-4 text-emerald-400 mx-auto" />
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
              a: "Each POST to /api/v1/telemetry counts as one log entry regardless of token count.",
            },
            {
              q: "How are overages billed?",
              a: "On Pro, each additional 1,000 logs beyond 250,000 is billed at $0.10. On Enterprise, rates are negotiated at $0.05/1k with volume discounts.",
            },
            {
              q: "Can I switch plans anytime?",
              a: "Yes — upgrades are immediate. Downgrades take effect at the start of your next billing cycle.",
            },
            {
              q: "Do you support custom models?",
              a: "Yes. AgentMeter accepts any model name and will calculate costs if your model is in our pricing dictionary, or allow you to provide explicit cost values.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-5">
              <div className="flex gap-3">
                <HelpCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
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
      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600 font-mono">
        <p>AgentMeter © 2026 • LLM Telemetry Infrastructure • Powered by Next.js & Supabase</p>
      </footer>
    </div>
  );
}
