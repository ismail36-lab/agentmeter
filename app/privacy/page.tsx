"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-xs font-mono text-zinc-500">Effective Date: January 1, 2026</p>
        </div>

        <section className="space-y-6 text-sm text-zinc-300 leading-relaxed font-sans">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">1. Information We Collect</h2>
            <p className="text-zinc-400">
              Meterix collects minimal technical telemetry metrics required to calculate LLM model cost, token usage, and API latency. We store request metadata, token counts (input/output), model names, and timestamp identifiers. We do not store raw prompt text or model completions unless explicitly opted-in for debug logging.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">2. How We Use Data</h2>
            <p className="text-zinc-400">
              Telemetry data is used exclusively to compute aggregate cost metrics, generate dashboard visualizations, enforce plan rate limits, and dispatch budget alerts configured by your team.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">3. Data Security &amp; Isolation</h2>
            <p className="text-zinc-400">
              All telemetry payloads transmitted to <code className="font-mono text-indigo-300 text-xs bg-zinc-900 px-1 py-0.5 rounded">/api/v1/telemetry</code> are encrypted in transit via TLS 1.3 and isolated per organization with row-level security policies.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">4. Data Retention</h2>
            <p className="text-zinc-400">
              Standard Pro tier telemetry logs are retained for 30 days, after which raw logs are automatically purged by automated cleanup background workers.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">5. Contact Us</h2>
            <p className="text-zinc-400">
              For privacy inquiries or data subject access requests, contact our compliance team at{" "}
              <a href="mailto:privacy@meterix.io" className="text-indigo-400 underline font-mono">
                privacy@meterix.io
              </a>
              .
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
