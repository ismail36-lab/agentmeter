"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function DpaPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Data Processing Addendum (DPA)</h1>
          <p className="text-xs font-mono text-zinc-500">Effective Date: January 1, 2026</p>
        </div>

        <section className="space-y-6 text-sm text-zinc-300 leading-relaxed font-sans">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">1. Scope &amp; Applicability</h2>
            <p className="text-zinc-400">
              This Data Processing Addendum (&quot;DPA&quot;) governs the processing of customer telemetry metadata by Meterix on behalf of customer organizations in compliance with GDPR, CCPA, and applicable global data protection regulations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">2. Processing Instructions</h2>
            <p className="text-zinc-400">
              Meterix processes customer technical data solely to fulfill obligations under the Service Agreement—specifically calculating LLM token consumption, latency metering, and aggregate cost analysis.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">3. Security Measures &amp; Encryption</h2>
            <p className="text-zinc-400">
              Meterix implements rigorous organizational and technical safeguards, including end-to-end encryption in transit (TLS 1.3), AES-256 encryption at rest, strict tenant data isolation, and automated log purging.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">4. Sub-processors</h2>
            <p className="text-zinc-400">
              Meterix engages tier-1 cloud infrastructure sub-processors for hosting and database persistence. All sub-processors are bound by data protection obligations at least as restrictive as those outlined in this DPA.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">5. Compliance Contact</h2>
            <p className="text-zinc-400">
              To request a signed copy of our Standard Contractual Clauses (SCCs) or DPA execution copy, contact our Data Protection Officer at{" "}
              <a href="mailto:dpo@meterix.io" className="text-indigo-400 underline font-mono">
                dpo@meterix.io
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
