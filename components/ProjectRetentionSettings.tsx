"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database, CheckCircle2, AlertCircle, Loader2, Clock, ShieldCheck, Lock, Sparkles, Building2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types & Retention Options
// ---------------------------------------------------------------------------

const RETENTION_OPTIONS = [
  { value: 7, label: "7 days", description: "Short-term / Free Tier", minPlan: "free" },
  { value: 30, label: "30 days", description: "Standard Pro Tier", minPlan: "pro" },
  { value: 60, label: "60 days", description: "Extended (Enterprise)", minPlan: "enterprise" },
  { value: 90, label: "90 days", description: "Quarterly (Enterprise)", minPlan: "enterprise" },
  { value: 365, label: "365 days", description: "Annual / Compliance", minPlan: "enterprise" },
] as const;

type RetentionValue = (typeof RETENTION_OPTIONS)[number]["value"];

interface ProjectSettings {
  id: string;
  name?: string;
  retention_days: RetentionValue | null;
}

interface SaveStatus {
  type: "idle" | "saving" | "success" | "error";
  message?: string;
}

interface ProjectRetentionSettingsProps {
  /** UUID of the project whose settings we are managing. */
  projectId: string;
  /**
   * User role passed from parent scope (owner, admin, member, viewer).
   */
  userRole?: "owner" | "admin" | "member" | "viewer";
  /**
   * User plan passed from parent scope (free, pro, enterprise).
   */
  userPlan?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the caller may edit settings (admin / owner). */
function canEdit(role?: string) {
  return role === "owner" || role === "admin" || role === undefined;
}

/** Check if a retention option is available for the current plan */
function isOptionAllowedForPlan(optionDays: RetentionValue, plan: string): boolean {
  const normalizedPlan = (plan || "free").toLowerCase();
  if (normalizedPlan === "enterprise") return true;
  if (normalizedPlan === "pro") return optionDays <= 30;
  // Free plan is strictly capped at 7 days
  return optionDays <= 7;
}

/** Get appropriate lock badge label for an option */
function getLockBadge(optionDays: RetentionValue, plan: string): { label: string; badgeClass: string } | null {
  if (isOptionAllowedForPlan(optionDays, plan)) return null;

  const normalizedPlan = (plan || "free").toLowerCase();
  if (normalizedPlan === "free" && optionDays === 30) {
    return {
      label: "Upgrade to Pro",
      badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    };
  }
  return {
    label: "Enterprise Plan Required",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectRetentionSettings({
  projectId,
  userRole: initialRole,
  userPlan: initialPlan = "free",
}: ProjectRetentionSettingsProps) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [activeRole, setActiveRole] = useState<string>(initialRole || "owner");
  const [activePlan, setActivePlan] = useState<string>(initialPlan);

  const [selectedDays, setSelectedDays] = useState<RetentionValue>(
    (initialPlan || "free").toLowerCase() === "free" ? 7 : 30
  );

  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });

  const readonly = !canEdit(activeRole);

  // Sync props if provided
  useEffect(() => {
    if (initialRole) setActiveRole(initialRole);
    if (initialPlan) setActivePlan(initialPlan);
  }, [initialRole, initialPlan]);

  // ── Fetch current settings ────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 403) {
          setSaveStatus({ type: "error", message: "You do not have permission to view these settings." });
        }
        return;
      }
      const data = await res.json();
      const proj: ProjectSettings = data.project;
      setSettings(proj);

      if (data.userRole) setActiveRole(data.userRole);
      if (data.userPlan) setActivePlan(data.userPlan);

      const plan = (data.userPlan || activePlan || "free").toLowerCase();
      const stored = proj.retention_days;

      if (stored && RETENTION_OPTIONS.some((o) => o.value === stored)) {
        if (isOptionAllowedForPlan(stored as RetentionValue, plan)) {
          setSelectedDays(stored as RetentionValue);
        } else {
          setSelectedDays(plan === "free" ? 7 : 30);
        }
      } else {
        setSelectedDays(plan === "free" ? 7 : 30);
      }
    } catch (err) {
      console.warn("[ProjectRetentionSettings] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, activePlan]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (readonly) return;

    if (!isOptionAllowedForPlan(selectedDays, activePlan)) {
      const badge = getLockBadge(selectedDays, activePlan);
      setSaveStatus({
        type: "error",
        message: badge?.label ? `${badge.label} to select ${selectedDays} days retention.` : "Plan limit exceeded.",
      });
      return;
    }

    setSaveStatus({ type: "saving" });

    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retention_days: selectedDays }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveStatus({
          type: "error",
          message: data.error ?? "Failed to update retention policy.",
        });
        return;
      }

      setSettings((prev) =>
        prev ? { ...prev, retention_days: data.project.retention_days } : prev
      );
      setSaveStatus({ type: "success", message: "Data retention policy saved successfully." });
      setTimeout(() => setSaveStatus({ type: "idle" }), 3000);
    } catch (err: any) {
      setSaveStatus({
        type: "error",
        message: err.message ?? "Network error. Please try again.",
      });
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const currentOption = RETENTION_OPTIONS.find((o) => o.value === selectedDays);
  const isDirty = settings?.retention_days !== selectedDays;
  const isFreePlan = (activePlan || "free").toLowerCase() === "free";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bento-card p-6 space-y-5 border border-zinc-800/80 bg-zinc-900/90">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-indigo-400 shrink-0">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100 font-sans tracking-tight">
                Data Retention Policy
              </h3>
              {readonly ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  READ-ONLY
                </span>
              ) : isFreePlan ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  7-DAY FREE TIER
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PRO TIER UNLOCKED
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configure telemetry log retention period for this project workspace.
            </p>
          </div>
        </div>

        {/* Role badge */}
        {activeRole && (
          <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold font-mono bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 uppercase tracking-wider">
            <ShieldCheck className="h-3 w-3 text-indigo-400" />
            {activeRole}
          </span>
        )}
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-zinc-500 font-mono">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
          Loading retention settings…
        </div>
      ) : (
        <>
          {/* Current retention summary */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="text-zinc-400">Current policy:</span>
              <span className="text-zinc-100 font-semibold">
                {settings?.retention_days != null
                  ? `${settings.retention_days} days`
                  : isFreePlan
                  ? "7 days (Free Default)"
                  : "30 days (Pro Default)"}
              </span>
            </div>
            {isFreePlan && (
              <a
                href="/api/checkout?plan=pro"
                className="text-[11px] font-sans font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3 text-indigo-400" />
                Upgrade to Pro (30 Days)
              </a>
            )}
          </div>

          {/* Option grid */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2.5">
              Select Retention Period
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {RETENTION_OPTIONS.map((option) => {
                const isSelected = selectedDays === option.value;
                const allowed = isOptionAllowedForPlan(option.value, activePlan);
                const lockBadge = getLockBadge(option.value, activePlan);
                const isDisabled = readonly || !allowed;

                return (
                  <div
                    key={option.value}
                    className={`
                      relative flex flex-col items-center justify-between p-3.5 rounded-xl border text-center transition-all duration-150 font-sans
                      ${isDisabled
                        ? "border-zinc-800/40 bg-zinc-950/20 text-zinc-600 cursor-not-allowed opacity-75"
                        : "cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5"
                      }
                      ${isSelected && allowed
                        ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-500/10"
                        : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400"
                      }
                    `}
                  >
                    <button
                      id={`retention-option-${option.value}`}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => allowed && !readonly && setSelectedDays(option.value)}
                      className="w-full flex flex-col items-center"
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center gap-1 font-mono">
                        <span className={`text-base font-bold ${isSelected && allowed ? "text-indigo-300" : "text-zinc-200"}`}>
                          {option.value}
                        </span>
                        <span className="text-[10px] font-medium text-zinc-500">days</span>
                      </div>

                      <span className={`text-[10px] mt-1 ${isSelected && allowed ? "text-indigo-400" : "text-zinc-500"}`}>
                        {option.description}
                      </span>
                    </button>

                    {/* Lock / Upgrade Badge */}
                    {lockBadge && (
                      <div className="mt-2 w-full pt-1.5 border-t border-zinc-800/60">
                        {lockBadge.label === "Upgrade to Pro" ? (
                          <a
                            href="/api/checkout?plan=pro"
                            className={`inline-flex items-center justify-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded border transition-colors ${lockBadge.badgeClass}`}
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {lockBadge.label}
                          </a>
                        ) : (
                          <span className={`inline-flex items-center justify-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${lockBadge.badgeClass}`}>
                            <Building2 className="h-2.5 w-2.5" />
                            {lockBadge.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save row */}
          {!readonly && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              {/* Status message */}
              <div className="text-xs font-sans">
                {saveStatus.type === "success" && (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {saveStatus.message}
                  </span>
                )}
                {saveStatus.type === "error" && (
                  <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {saveStatus.message}
                  </span>
                )}
                {saveStatus.type === "idle" && isDirty && (
                  <span className="text-zinc-400">
                    Unsaved change — selected{" "}
                    <span className="text-indigo-300 font-semibold font-mono">{selectedDays} days</span>
                    {currentOption ? ` (${currentOption.description})` : ""}
                  </span>
                )}
              </div>

              {/* Save button */}
              <button
                id="save-retention-btn"
                type="button"
                onClick={handleSave}
                disabled={saveStatus.type === "saving" || !isDirty || !isOptionAllowedForPlan(selectedDays, activePlan)}
                className="
                  inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                  bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500
                  text-white disabled:cursor-not-allowed transition-all duration-150 shadow-sm
                  shrink-0
                "
              >
                {saveStatus.type === "saving" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {saveStatus.type === "saving" ? "Saving…" : "Save Retention Policy"}
              </button>
            </div>
          )}

          {/* Compliance hint */}
          <p className="text-[11px] text-zinc-600 font-sans leading-relaxed border-t border-zinc-800/60 pt-3">
            <span className="font-semibold text-zinc-500">Note:</span> Free Tier projects are fixed at 7-day log retention. Upgrade to Pro ($99/mo) to unlock up to 30 days. Logs older than the selected retention period are automatically purged by nightly background cleanup jobs. Only <span className="text-zinc-400 font-semibold">admin</span> and <span className="text-zinc-400 font-semibold">owner</span> roles may update retention policy.
          </p>
        </>
      )}
    </div>
  );
}
