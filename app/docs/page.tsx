"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Zap,
  BookOpen,
  ArrowLeft,
  Copy,
  CheckCircle2,
  Terminal,
  Code2,
  Cpu,
  ShieldCheck,
  Globe,
  Layers,
  FileCode,
  Key,
  Database,
  Server,
  Check,
} from "lucide-react";

export default function DocsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("https://meterix.app");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const pythonInstallCode = `pip install meterix`;

  const pythonSnippet = `from meterix import Meterix

# Initialize Meterix client with your secret API key
meter = Meterix(api_key="mx_live_your_api_key_here")

# 1. Log telemetry payload manually after an LLM call
response = meter.log_usage(
    model="gpt-4o",
    prompt_tokens=1250,
    completion_tokens=480,
    metadata={
        "environment": "production",
        "agent_name": "CustomerSupportAgent",
        "user_id": "usr_99182"
    }
)
print("Meterix Ingestion Status:", response)

# 2. Or use the trace context manager to automatically track latency
with meter.trace(model="claude-3-5-sonnet", metadata={"workflow": "code_review"}) as t:
    # Perform your LLM completion call here
    pass`;

  const nodeInstallCode = `npm i meterix`;

  const nodeSnippet = `import { MeterixClient } from "@/lib/meterix";

// Singleton — initialize once at module level
const meter = new MeterixClient({
  apiKey: process.env.METERIX_API_KEY,  // mx_live_...
  flushIntervalMs: 3000,               // auto-flush every 3 seconds
  maxBufferSize: 50,                   // force flush when buffer hits 50
});

async function runAgent() {
  // logUsage() returns immediately — { queued: true }
  // Network request happens in the background batch flush
  const queued = meter.logUsage({
    model: "gpt-4o",
    promptTokens: 1500,
    completionTokens: 450,
    metadata: {
      environment: "production",
      agent_name: "SupportAgent",
      session_id: "sess_881923",
    },
  });

  console.log(queued); // { queued: true }

  // Optional: manually flush all buffered logs immediately
  await meter.flush();
}

runAgent();`;

  const vercelSnippet = `// app/api/route.ts — Next.js Route Handler (Vercel Edge / Serverless)
import { waitUntil } from "@vercel/functions";
import { MeterixClient, flushWithWaitUntil } from "@/lib/meterix";

const meter = new MeterixClient({ apiKey: process.env.METERIX_API_KEY });

export async function POST(req: Request) {
  // Your LLM call here
  const result = await callLLM(req);

  // Queue telemetry — fire-and-forget
  meter.logUsage({
    model: "gpt-4o",
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
    metadata: { environment: "production" },
  });

  // waitUntil() ensures the flush completes AFTER the response is returned
  // This is critical for serverless — avoids cold-start truncation
  flushWithWaitUntil(meter, waitUntil);

  return Response.json({ answer: result.content });
}`;

  const shutdownSnippet = `// Node.js Long-Running Server (Express, Fastify, etc.)
import { MeterixClient } from "@/lib/meterix";

// MeterixClient automatically registers these — shown here for reference:
const meter = new MeterixClient({
  apiKey: process.env.METERIX_API_KEY,
  registerShutdownHandlers: true, // default: true
});

// You can also register manually for full control:
process.once("SIGTERM", async () => {
  console.log("SIGTERM received — flushing telemetry...");
  await meter.flush();
  meter.destroy();  // stop the background flush interval
  process.exit(0);
});

process.once("beforeExit", async () => {
  await meter.flush();
});`;

  const curlSnippet = `curl -X POST ${baseUrl}/api/v1/telemetry \\
  -H "Authorization: Bearer mx_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "prompt_tokens": 1500,
    "completion_tokens": 450,
    "metadata": {
      "environment": "production",
      "agent_name": "SupportAgent"
    }
  }'`;

  const modelsCurlSnippet = `curl -X GET ${baseUrl}/api/models`;

  const keysCurlSnippet = `curl -X GET ${baseUrl}/api/keys \\
  -H "Authorization: Bearer <YOUR_SESSION_TOKEN>"`;

  const jsonResponseSnippet = `{
  "success": true,
  "log_id": "c5cf61ee-6ff6-4f73-a1e7-e75ca9601324",
  "model": "gpt-4o",
  "prompt_tokens": 1500,
  "completion_tokens": 450,
  "total_tokens": 1950,
  "calculated_cost": 0.00825,
  "is_estimated": false,
  "currency": "USD",
  "timestamp": "2026-08-15T10:23:00.000Z"
}`;

  const modelsResponseSnippet = `{
  "models": [
    {
      "model_name": "gpt-4o",
      "provider": "openai",
      "input_price_per_million": 2.5,
      "output_price_per_million": 10.0,
      "is_active": true
    },
    {
      "model_name": "claude-3-5-sonnet",
      "provider": "anthropic",
      "input_price_per_million": 3.0,
      "output_price_per_million": 15.0,
      "is_active": true
    }
  ]
}`;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 flex flex-col font-sans selection:bg-indigo-500/20 w-full max-w-full overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md">
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-indigo-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight text-zinc-50 font-sans">
                Meterix
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Developer Documentation
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-indigo-400" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8 overflow-x-hidden">
        
        {/* Banner */}
        <div className="bento-card p-6 border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-zinc-50 tracking-tight flex items-center gap-2 font-sans">
                <BookOpen className="h-6 w-6 text-indigo-400" />
                Integration &amp; API Reference
              </h1>
              <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
                Connect your AI agents and LLM backend pipelines to Meterix. Real-time cost calculation, token metering, and telemetry aggregation in under 2 minutes.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          <a
            href="#python-sdk"
            className="bento-card p-4 hover:border-indigo-500/50 transition-all group flex items-center gap-3 w-full"
          >
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">Python SDK</h3>
              <p className="text-[11px] text-zinc-500">pip install meterix</p>
            </div>
          </a>

          <a
            href="#nodejs-sdk"
            className="bento-card p-4 hover:border-sky-500/50 transition-all group flex items-center gap-3 w-full"
          >
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:scale-105 transition-transform">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">Node.js / TypeScript</h3>
              <p className="text-[11px] text-zinc-500">Async buffered SDK</p>
            </div>
          </a>

          <a
            href="#vercel-pattern"
            className="bento-card p-4 hover:border-emerald-500/50 transition-all group flex items-center gap-3 w-full"
          >
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">Vercel / Serverless</h3>
              <p className="text-[11px] text-zinc-500">waitUntil() pattern</p>
            </div>
          </a>

          <a
            href="#rest-api"
            className="bento-card p-4 hover:border-violet-500/50 transition-all group flex items-center gap-3 w-full"
          >
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:scale-105 transition-transform">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">REST API</h3>
              <p className="text-[11px] text-zinc-500">POST /api/v1/telemetry</p>
            </div>
          </a>
        </div>

        {/* ── Section 1: Python SDK ───────────────────────────── */}
        <section id="python-sdk" className="bento-card p-6 space-y-4 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <FileCode className="h-4.5 w-4.5 text-indigo-400" />
              1. Python SDK Integration Guide
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Python 3.8+
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-zinc-400 font-sans">
              Install the official Meterix Python package from PyPI:
            </p>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-3.5 font-mono text-xs text-indigo-400 flex items-center justify-between w-full max-w-full overflow-x-auto">
              <span>{pythonInstallCode}</span>
              <button
                onClick={() => copyToClipboard(pythonInstallCode, "py_install")}
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy package command"
              >
                {copiedId === "py_install" ? (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400 font-sans">
              Initialize the client and send telemetry logs after calling OpenAI, Anthropic, or custom LLM endpoints:
            </p>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(pythonSnippet, "py_snippet")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy code snippet"
              >
                {copiedId === "py_snippet" ? (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{pythonSnippet}</pre>
            </div>
          </div>
        </section>

        {/* ── Section 2: Node.js / TypeScript ───────────────── */}
        <section id="nodejs-sdk" className="bento-card p-6 space-y-4 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <Code2 className="h-4.5 w-4.5 text-sky-400" />
              2. Node.js / TypeScript SDK Integration Guide
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Node.js 16+
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-zinc-400 font-sans">
              Install the Node.js SDK via npm or yarn:
            </p>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-3.5 font-mono text-xs text-sky-400 flex items-center justify-between w-full max-w-full overflow-x-auto">
              <span>{nodeInstallCode}</span>
              <button
                onClick={() => copyToClipboard(nodeInstallCode, "node_install")}
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy package command"
              >
                {copiedId === "node_install" ? (
                  <CheckCircle2 className="h-4 w-4 text-sky-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400 font-sans">
              Import and initialize the client in your backend application or Next.js API routes:
            </p>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(nodeSnippet, "node_snippet")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy code snippet"
              >
                {copiedId === "node_snippet" ? (
                  <CheckCircle2 className="h-4 w-4 text-sky-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{nodeSnippet}</pre>
            </div>
          </div>
        </section>

        {/* ── Section 2b: Vercel / Serverless Pattern ─────────── */}
        <section id="vercel-pattern" className="bento-card p-6 space-y-5 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <Server className="h-4.5 w-4.5 text-emerald-400" />
              2b. Vercel &amp; Serverless Environments
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              waitUntil() pattern
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans leading-relaxed">
            In serverless environments (Vercel Functions, Next.js Route Handlers, Edge Runtime), the process may be
            frozen immediately after sending the HTTP response — before background flushes complete.
            Use <code className="text-emerald-300 font-mono">@vercel/functions</code>{" "}waitUntil() to keep the function alive
            until the telemetry batch is fully flushed.
          </p>

          {/* Vercel waitUntil snippet */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Next.js Route Handler + waitUntil()</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(vercelSnippet, "vercel_snippet")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy Vercel snippet"
              >
                {copiedId === "vercel_snippet" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{vercelSnippet}</pre>
            </div>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <div className="font-bold font-mono text-emerald-400 mb-1">logUsage()</div>
              <p className="text-[11px] text-zinc-400">Returns <code className="text-zinc-200">{'{ queued: true }'}</code> instantly. Never blocks your response.</p>
            </div>
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs">
              <div className="font-bold font-mono text-sky-400 mb-1">flushWithWaitUntil()</div>
              <p className="text-[11px] text-zinc-400">Wraps <code className="text-zinc-200">meter.flush()</code> in Vercel's waitUntil to guarantee delivery post-response.</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
              <div className="font-bold font-mono text-amber-400 mb-1">Silent Failures</div>
              <p className="text-[11px] text-zinc-400">Network errors are caught internally — never propagated to your application.</p>
            </div>
          </div>

          {/* Node.js graceful shutdown */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Node.js Graceful Shutdown (SIGTERM / beforeExit)</h3>
            <p className="text-xs text-zinc-400 font-sans">
              For long-running Node.js servers, <code className="text-zinc-200 font-mono">MeterixClient</code> automatically
              registers <code className="text-zinc-200 font-mono">beforeExit</code> and <code className="text-zinc-200 font-mono">SIGTERM</code> listeners
              to flush any remaining buffered logs before process exit.
            </p>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(shutdownSnippet, "shutdown_snippet")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy shutdown snippet"
              >
                {copiedId === "shutdown_snippet" ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{shutdownSnippet}</pre>
            </div>
          </div>
        </section>

        {/* ── Section 3: REST API Reference ──────────────────── */}
        <section id="rest-api" className="bento-card p-6 space-y-5 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <Globe className="h-4.5 w-4.5 text-violet-400" />
              3. REST API Reference: Ingestion Endpoint
            </h2>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
              POST /api/v1/telemetry
            </span>
          </div>

          {/* Headers */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Required HTTP Headers</h3>
            <div className="w-full max-w-full overflow-x-auto rounded-lg border border-zinc-800 bg-[#0c0d0e] p-4 font-mono text-xs">
              <div className="space-y-1.5 text-zinc-300">
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 font-semibold">Authorization:</span>
                  <span>Bearer &lt;YOUR_API_KEY&gt;</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-violet-400 font-semibold">Content-Type:</span>
                  <span>application/json</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payload Parameters Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">JSON Request Payload Fields</h3>
            <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900/50 text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-4">Field</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Required</th>
                    <th className="py-2.5 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-indigo-400">model</td>
                    <td className="py-2.5 px-4 text-zinc-500">string</td>
                    <td className="py-2.5 px-4 text-indigo-400">Yes</td>
                    <td className="py-2.5 px-4 text-zinc-400">LLM model name (e.g. <code className="text-zinc-200">gpt-4o</code>, <code className="text-zinc-200">gpt-4o-mini</code>, <code className="text-zinc-200">claude-3-5-sonnet</code>).</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-indigo-400">prompt_tokens</td>
                    <td className="py-2.5 px-4 text-zinc-500">integer</td>
                    <td className="py-2.5 px-4 text-indigo-400">Yes*</td>
                    <td className="py-2.5 px-4 text-zinc-400">Number of prompt / input tokens processed (*or alias <code className="text-zinc-200">input_tokens</code>).</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-indigo-400">completion_tokens</td>
                    <td className="py-2.5 px-4 text-zinc-500">integer</td>
                    <td className="py-2.5 px-4 text-indigo-400">Yes*</td>
                    <td className="py-2.5 px-4 text-zinc-400">Number of completion / output tokens generated (*or alias <code className="text-zinc-200">output_tokens</code>).</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-sky-400">metadata</td>
                    <td className="py-2.5 px-4 text-zinc-500">object</td>
                    <td className="py-2.5 px-4 text-zinc-500">Optional</td>
                    <td className="py-2.5 px-4 text-zinc-400">Custom metadata key-value tags (e.g. <code className="text-zinc-200">environment</code>, <code className="text-zinc-200">agent_id</code>).</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-semibold text-sky-400">latency_ms</td>
                    <td className="py-2.5 px-4 text-zinc-500">number</td>
                    <td className="py-2.5 px-4 text-zinc-500">Optional</td>
                    <td className="py-2.5 px-4 text-zinc-400">LLM request round-trip latency in milliseconds.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Curl Sample */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Example cURL Command</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(curlSnippet, "curl_snippet")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy cURL snippet"
              >
                {copiedId === "curl_snippet" ? (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{curlSnippet}</pre>
            </div>
          </div>

          {/* Success Response Sample */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Successful Response (200 OK)</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-indigo-400 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(jsonResponseSnippet, "json_res")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy JSON response"
              >
                {copiedId === "json_res" ? (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="leading-relaxed">{jsonResponseSnippet}</pre>
            </div>
          </div>

          {/* Status Codes Notice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 w-full">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs w-full">
              <div className="font-bold font-mono text-indigo-400">200 Success</div>
              <p className="text-[11px] text-zinc-400 mt-1">Payload validated, cost calculated, and log stored in Supabase.</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs w-full">
              <div className="font-bold font-mono text-amber-400">401 Unauthorized</div>
              <p className="text-[11px] text-zinc-400 mt-1">Invalid or revoked secret key provided in Authorization header.</p>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs w-full">
              <div className="font-bold font-mono text-rose-400">429 Quota Exceeded</div>
              <p className="text-[11px] text-zinc-400 mt-1">Monthly log quota limit reached for organization plan tier.</p>
            </div>
          </div>
        </section>

        {/* ── Section 4: Models Endpoint ──────────────────────── */}
        <section id="models-api" className="bento-card p-6 space-y-5 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <Database className="h-4.5 w-4.5 text-emerald-400" />
              4. Active Models Endpoint
            </h2>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              GET /api/models
            </span>
          </div>

          <p className="text-xs text-zinc-400 font-sans">
            Returns all active LLM model pricing configurations filtered strictly by <code className="text-zinc-200 font-mono">is_active = true</code>.
          </p>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Example Request</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(modelsCurlSnippet, "models_curl")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy cURL snippet"
              >
                {copiedId === "models_curl" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{modelsCurlSnippet}</pre>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Sample Response</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-emerald-400 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(modelsResponseSnippet, "models_res")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy JSON response"
              >
                {copiedId === "models_res" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="leading-relaxed">{modelsResponseSnippet}</pre>
            </div>
          </div>
        </section>

        {/* ── Section 5: API Keys Endpoint ────────────────────── */}
        <section id="keys-api" className="bento-card p-6 space-y-5 w-full border border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 font-sans tracking-tight">
              <Key className="h-4.5 w-4.5 text-amber-400" />
              5. API Key Management Endpoints
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold">
                GET /api/keys
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold">
                POST /api/keys
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-400 font-sans">
            Lists or generates secret API keys for authenticated dashboard users. Newly generated keys format as <code className="text-amber-300 font-mono">mx_live_&lt;random_32_chars&gt;</code> and are stored using SHA-256 hashes (<code className="text-zinc-200 font-mono">key_hash</code>).
          </p>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-sans">Example List Keys Request</h3>
            <div className="relative bg-[#0c0d0e] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 w-full max-w-full overflow-x-auto">
              <button
                onClick={() => copyToClipboard(keysCurlSnippet, "keys_curl")}
                className="absolute right-3 top-3 p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
                title="Copy cURL snippet"
              >
                {copiedId === "keys_curl" ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <pre className="text-zinc-200 leading-relaxed">{keysCurlSnippet}</pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
