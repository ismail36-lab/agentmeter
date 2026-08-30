"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/20">
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-sm tracking-tight font-mono text-zinc-50">
            Meterix<span className="text-indigo-400">.</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-indigo-400" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="space-y-2 border-b border-zinc-800 pb-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-mono">
            <Shield className="h-3.5 w-3.5" />
            Legal &amp; Compliance
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-xs font-mono text-zinc-500">Effective Date: January 1, 2026</p>
        </div>

        <section className="space-y-6 text-sm text-zinc-300 leading-relaxed font-sans">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">1. Terms Overview</h2>
            <p className="text-zinc-400">
              By accessing or using the Meterix API infrastructure and telemetry platform, you agree to be bound by these Terms of Service. Meterix provides LLM cost calculation, usage metering, and real-time telemetry ingestion.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">2. API Keys &amp; Account Security</h2>
            <p className="text-zinc-400">
              You are responsible for maintaining the confidentiality of your secret API keys (<code className="font-mono text-indigo-300 text-xs bg-zinc-900 px-1 py-0.5 rounded">mx_live_...</code>). Any telemetry payload submitted with your secret API key will be attributed to your organization account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">3. Subscriptions &amp; Usage Billing</h2>
            <p className="text-zinc-400">
              The Pro Plan includes 500,000 monthly telemetry log ingestions. Usage beyond included monthly volume is billed at the pay-as-you-go overage rate of $0.10 per 1,000 additional logs.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">4. Acceptable Use Policy</h2>
            <p className="text-zinc-400">
              You may not use Meterix to transmit malicious payloads, attempt to bypass rate limiting controls, or reverse-engineer proprietary pricing model algorithms.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">5. Service Level &amp; Limitation of Liability</h2>
            <p className="text-zinc-400">
              Meterix infrastructure is designed for high-availability LLM telemetry ingestion. Meterix is provided &quot;as is&quot; without warranties of any kind beyond our standard uptime commitment.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600 font-mono">
        <p>Meterix © 2026 • Enterprise LLM Infrastructure</p>
      </footer>
    </div>
  );
}
