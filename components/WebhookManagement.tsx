"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Zap,
  Radio,
  ExternalLink,
  ShieldCheck,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: "slack" | "discord";
  triggers: string[];
  is_active: boolean;
  created_at: string;
}

export function WebhookManagement() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form State
  const [name, setName] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [type, setType] = useState<"slack" | "discord">("slack");
  const [triggerAlert, setTriggerAlert] = useState<boolean>(true);
  const [triggerExceeded, setTriggerExceeded] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Testing State
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResultMap, setTestResultMap] = useState<Record<string, { success: boolean; message: string }>>({});

  const fetchWebhooks = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/webhooks/config", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.webhooks) {
          setWebhooks(data.webhooks);
        }
      }
    } catch (err) {
      console.warn("Could not fetch webhook configs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setFormError("Webhook Target URL is required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const triggers: string[] = [];
    if (triggerAlert) triggers.push("budget_alert");
    if (triggerExceeded) triggers.push("budget_exceeded");

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/webhooks/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim() || `${type.toUpperCase()} Alert Webhook`,
          url: url.trim(),
          type,
          triggers,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to add webhook");
        return;
      }

      if (data.webhook) {
        setWebhooks((prev) => [data.webhook, ...prev]);
        setName("");
        setUrl("");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to save webhook");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestWebhook = async (wh: WebhookConfig) => {
    setTestingId(wh.id);
    setTestResultMap((prev) => ({ ...prev, [wh.id]: undefined as any }));

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/webhooks/test", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: wh.url, type: wh.type }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResultMap((prev) => ({
          ...prev,
          [wh.id]: { success: true, message: `Sent to ${wh.type.toUpperCase()}!` },
        }));
      } else {
        setTestResultMap((prev) => ({
          ...prev,
          [wh.id]: { success: false, message: data.error || data.details || "Test Failed" },
        }));
      }
    } catch (err: any) {
      setTestResultMap((prev) => ({
        ...prev,
        [wh.id]: { success: false, message: err.message || "Connection Failed" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/webhooks/config?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
      }
    } catch (err) {
      console.warn("Failed to delete webhook:", err);
    }
  };

  return (
    <div className="bento-card p-6 space-y-6 w-full border border-zinc-800/80 bg-zinc-900/90 font-sans">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50 flex items-center gap-2 tracking-tight">
            <Bell className="h-5 w-5 text-indigo-400" />
            Slack &amp; Discord Webhook Integrations
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Dispatch real-time Slack (Block Kit) and Discord (Embeds) alerts when budget limits or warning thresholds are triggered.
          </p>
        </div>

        <button
          onClick={fetchWebhooks}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-indigo-400 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Add Webhook Form ──────────────────────────────────── */}
      <form onSubmit={handleAddWebhook} className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-400" />
          Add Webhook Target Endpoint
        </div>

        {formError && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          <div>
            <label className="block text-zinc-400 mb-1 font-sans text-[11px]">Webhook Name</label>
            <input
              type="text"
              placeholder="e.g. #devops-slack-alerts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500/60 font-mono transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1 font-sans text-[11px]">Platform Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType("slack")}
                className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  type === "slack"
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
              >
                <span>Slack</span>
                <span className="text-[9px] font-mono opacity-80">(Block Kit)</span>
              </button>
              <button
                type="button"
                onClick={() => setType("discord")}
                className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  type === "discord"
                    ? "bg-violet-600 text-white border-violet-500"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
              >
                <span>Discord</span>
                <span className="text-[9px] font-mono opacity-80">(Embeds)</span>
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-zinc-400 mb-1 font-sans text-[11px]">Target Webhook URL</label>
            <input
              type="url"
              placeholder={
                type === "slack"
                  ? "https://hooks.slack.com/services/T000/B000/XXXXX"
                  : "https://discord.com/api/webhooks/123456/abcdef"
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500/60 font-mono transition-colors"
            />
          </div>
        </div>

        {/* Trigger Selection */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-4 text-xs font-sans">
            <span className="text-zinc-400 font-medium">Active Event Triggers:</span>
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={triggerAlert}
                onChange={(e) => setTriggerAlert(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0"
              />
              <span>budget_alert (Warning)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={triggerExceeded}
                onChange={(e) => setTriggerExceeded(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0"
              />
              <span>budget_exceeded (Block/Revoke)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !url}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Add Integration</span>
          </button>
        </div>
      </form>

      {/* ── Webhook Configs List Table ────────────────────────── */}
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
            <tr>
              <th className="py-3 px-4 whitespace-nowrap">Webhook Name</th>
              <th className="py-3 px-4 whitespace-nowrap">Type</th>
              <th className="py-3 px-4 min-w-[12rem] whitespace-nowrap">Target Webhook URL</th>
              <th className="py-3 px-4 whitespace-nowrap">Active Triggers</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-indigo-400" />
                  Loading webhook configurations...
                </td>
              </tr>
            ) : webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500 font-mono">
                  No active webhooks configured. Add your Slack or Discord webhook above!
                </td>
              </tr>
            ) : (
              webhooks.map((wh) => {
                const testResult = testResultMap[wh.id];

                return (
                  <tr key={wh.id} className="hover:bg-zinc-900/50 transition-colors">
                    {/* Name */}
                    <td className="py-3 px-4 whitespace-nowrap font-sans font-semibold text-zinc-200">
                      {wh.name}
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono border uppercase ${
                          wh.type === "discord"
                            ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                            : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        }`}
                      >
                        {wh.type}
                      </span>
                    </td>

                    {/* Masked URL */}
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                      <span className="font-mono text-xs bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                        {wh.url.length > 32 ? `${wh.url.slice(0, 24)}...${wh.url.slice(-8)}` : wh.url}
                      </span>
                    </td>

                    {/* Triggers */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {(wh.triggers || []).map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 text-[9px] rounded font-semibold bg-zinc-900 text-zinc-300 border border-zinc-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Actions: Test & Delete */}
                    <td className="py-3 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        {testResult && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-sans font-medium flex items-center gap-1 ${
                              testResult.success
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {testResult.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {testResult.message}
                          </span>
                        )}

                        <button
                          onClick={() => handleTestWebhook(wh)}
                          disabled={testingId === wh.id}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs font-sans font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                          title="Send test payload to webhook URL"
                        >
                          {testingId === wh.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                          ) : (
                            <Send className="h-3 w-3 text-indigo-400" />
                          )}
                          <span>Test</span>
                        </button>

                        <button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="p-1 rounded hover:bg-rose-950/50 text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Delete Webhook"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
  );
}
