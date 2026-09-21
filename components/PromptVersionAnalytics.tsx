"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  TrendingDown,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  BarChart3,
  Layers,
  DollarSign,
  ChevronRight,
  Sliders,
} from "lucide-react";

interface PromptVersionData {
  id: string;
  prompt_id: string;
  prompt_name: string;
  prompt_slug: string;
  version: string;
  model: string;
  template_text: string;
  created_at: string;
  is_active: boolean;
  total_requests: number;
  total_cost_usd: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  cost_per_1k_runs: number;
  estimated_margin_pct: number;
}

export function PromptVersionAnalytics() {
  const [prompts, setPrompts] = useState<PromptVersionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPromptSlug, setSelectedPromptSlug] = useState<string>("customer-support-copilot");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states for new prompt version
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formVersion, setFormVersion] = useState("v1.2");
  const [formModel, setFormModel] = useState("gpt-4o-mini");
  const [formTemplate, setFormTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  async function fetchPrompts() {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/prompts");
      const data = await res.json();
      if (data.success && Array.isArray(data.prompts)) {
        setPrompts(data.prompts);
      }
    } catch (err) {
      console.warn("Failed fetching prompt versions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!formName || !formSlug || !formVersion || !formTemplate) return;
    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          slug: formSlug,
          version: formVersion,
          model: formModel,
          template_text: formTemplate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setFormName("");
        setFormSlug("");
        setFormTemplate("");
        fetchPrompts();
      }
    } catch (err) {
      console.error("Error creating prompt:", err);
    } finally {
      setSubmitting(false);
    }
  }

  // Filter versions by selected prompt slug
  const availableSlugs = Array.from(new Set(prompts.map((p) => p.prompt_slug)));
  const currentVersions = prompts.filter((p) => p.prompt_slug === selectedPromptSlug);

  // Sort: lowest unit cost first
  const sortedVersions = [...currentVersions].sort(
    (a, b) => a.cost_per_1k_runs - b.cost_per_1k_runs
  );

  const bestVersion = sortedVersions[0];
  const worstVersion = sortedVersions[sortedVersions.length - 1];
  const savingsPct =
    worstVersion && bestVersion && worstVersion.cost_per_1k_runs > 0
      ? Number(
          (
            ((worstVersion.cost_per_1k_runs - bestVersion.cost_per_1k_runs) /
              worstVersion.cost_per_1k_runs) *
            100
          ).toFixed(1)
        )
      : 0;

  return (
    <div className="w-full space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-zinc-900/80 to-emerald-950/30 border border-purple-800/20 backdrop-blur-md shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Prompt Version Registry & Unit Economics
            </h2>
          </div>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Track token consumption, unit cost per 1,000 runs, and margin impact across prompt iterations.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-purple-900/30 border border-purple-400/20"
        >
          <Plus className="w-4 h-4" />
          <span>Register Prompt Version</span>
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Tracked Versions */}
        <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Tracked Versions</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {loading ? "--" : prompts.length}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Across {availableSlugs.length} prompt families</div>
        </div>

        {/* Max Unit Economics Savings */}
        <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Unit Cost Reduction</span>
            <TrendingDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {loading ? "--" : savingsPct > 0 ? `-${savingsPct}%` : "0%"}
          </div>
          <div className="text-xs text-emerald-500/80 mt-1 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Via prompt optimization</span>
          </div>
        </div>

        {/* Lowest Unit Cost */}
        <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Lowest Unit Cost</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {loading || !bestVersion ? "--" : `$${bestVersion.cost_per_1k_runs.toFixed(2)}`}
          </div>
          <div className="text-xs text-zinc-400 mt-1 truncate">
            {bestVersion ? `${bestVersion.version} (${bestVersion.model})` : "Per 1k runs"}
          </div>
        </div>

        {/* Top Margin Version */}
        <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Top Margin Grade</span>
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400">
            {loading || !bestVersion ? "--" : `${bestVersion.estimated_margin_pct.toFixed(1)}%`}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Gross margin attribution</div>
        </div>
      </div>

      {/* Prompt Family Selection & Table */}
      <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Prompt Economics Comparison</h3>
              <p className="text-xs text-zinc-400">Compare cost efficiency and token payload by prompt family</p>
            </div>
          </div>

          {/* Prompt Selector Pills */}
          <div className="flex flex-wrap gap-2">
            {availableSlugs.map((slug) => {
              const matched = prompts.find((p) => p.prompt_slug === slug);
              return (
                <button
                  key={slug}
                  onClick={() => setSelectedPromptSlug(slug)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedPromptSlug === slug
                      ? "bg-purple-600/30 border border-purple-500/40 text-purple-300 shadow-sm"
                      : "bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                  }`}
                >
                  {matched?.prompt_name || slug}
                </button>
              );
            })}
          </div>
        </div>

        {/* Version Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/60 text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Prompt Version</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4 text-right">Avg Tokens (In/Out)</th>
                <th className="py-3 px-4 text-right">Total Runs</th>
                <th className="py-3 px-4 text-right">Total Spend</th>
                <th className="py-3 px-4 text-right">Unit Cost / 1k</th>
                <th className="py-3 px-4 text-right">Est. Margin</th>
                <th className="py-3 px-4 text-center">Efficiency Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {currentVersions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                    No prompt versions registered under this family.
                  </td>
                </tr>
              ) : (
                currentVersions.map((v) => {
                  const isTopUnitCost = bestVersion && v.id === bestVersion.id && currentVersions.length > 1;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-zinc-800/30 transition-colors duration-150"
                    >
                      <td className="py-3.5 px-4 font-sans font-medium text-zinc-200">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                          <span>{v.version}</span>
                          {v.is_active && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400">{v.model}</td>
                      <td className="py-3.5 px-4 text-right text-zinc-300">
                        <span className="text-zinc-400">{v.avg_input_tokens}</span>
                        <span className="text-zinc-600 mx-1">/</span>
                        <span className="text-purple-300">{v.avg_output_tokens}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-zinc-300">
                        {v.total_requests.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right text-zinc-200 font-bold">
                        ${v.total_cost_usd.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-amber-300 font-bold">
                        ${v.cost_per_1k_runs.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                        {v.estimated_margin_pct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-center font-sans">
                        {isTopUnitCost ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <Sparkles className="w-3 h-3" />
                            <span>Optimal Unit Econ</span>
                          </span>
                        ) : v.cost_per_1k_runs > 10.0 ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>High Cost/Run</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400">
                            Standard
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Side-by-Side Prompt Template Inspector */}
        {currentVersions.length >= 2 && worstVersion && bestVersion && (
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>Side-by-Side Unit Economics Breakdown ({bestVersion.version} vs {worstVersion.version})</span>
              </h4>
              <span className="text-xs text-emerald-400 font-medium">
                Saves ${(worstVersion.cost_per_1k_runs - bestVersion.cost_per_1k_runs).toFixed(2)} per 1,000 requests
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Baseline High-Cost Version */}
              <div className="p-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-zinc-400">Baseline ({worstVersion.version})</span>
                  <span className="text-amber-400 font-mono">${worstVersion.cost_per_1k_runs.toFixed(2)} / 1k</span>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 text-[11px] font-mono text-zinc-400 break-all border border-zinc-800/80">
                  {worstVersion.template_text}
                </div>
              </div>

              {/* Optimized Version */}
              <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <span>Optimized ({bestVersion.version})</span>
                    <Sparkles className="w-3 h-3" />
                  </span>
                  <span className="text-emerald-300 font-mono">${bestVersion.cost_per_1k_runs.toFixed(2)} / 1k</span>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 text-[11px] font-mono text-emerald-200/90 break-all border border-emerald-900/40">
                  {bestVersion.template_text}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Register Prompt Version Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-5 text-zinc-100">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <span>Register Prompt Version</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePrompt} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Prompt Name</label>
                <input
                  type="text"
                  placeholder="e.g. Customer Support Copilot"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!formSlug) {
                      setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }
                  }}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Slug</label>
                  <input
                    type="text"
                    placeholder="customer-support-copilot"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Version Tag</label>
                  <input
                    type="text"
                    placeholder="v1.2"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Target Model</label>
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini ($0.15/$0.60 per 1M)</option>
                  <option value="gpt-4o">gpt-4o ($2.50/$10.00 per 1M)</option>
                  <option value="claude-sonnet-4-5">claude-sonnet-4-5 ($3.00/$15.00 per 1M)</option>
                  <option value="claude-haiku-3-5">claude-haiku-3-5 ($0.80/$4.00 per 1M)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash ($0.10/$0.40 per 1M)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Template Text</label>
                <textarea
                  rows={4}
                  placeholder="Enter prompt template text with handlebars variables..."
                  value={formTemplate}
                  onChange={(e) => setFormTemplate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
                >
                  {submitting ? "Saving..." : "Save Prompt Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
