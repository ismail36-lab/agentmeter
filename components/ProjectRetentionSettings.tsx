"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database, CheckCircle2, AlertCircle, Loader2, Clock, ShieldCheck } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const RETENTION_OPTIONS = [
  { value: 7, label: "7 days", description: "Short-term / debugging" },
  { value: 30, label: "30 days", description: "Standard" },
  { value: 60, label: "60 days", description: "Extended" },
  { value: 90, label: "90 days", description: "Quarterly" },
  { value: 365, label: "365 days", description: "Annual / compliance" },
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
   * Optional: pass the user's role so the component can disable editing
   * for non-admin users without an extra API call.
   * If omitted the component will still work — the server will reject
   * unauthorised PATCH requests with 403.
   */
  userRole?: "owner" | "admin" | "member" | "viewer";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the caller may edit settings (admin / owner). */
function canEdit(role?: string) {
  return role === "owner" || role === "admin" || role === undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectRetentionSettings({
  projectId,
  userRole,
}: ProjectRetentionSettingsProps) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [selectedDays, setSelectedDays] = useState<RetentionValue>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle" });
  const readonly = !canEdit(userRole);

  // ── Fetch current settings ────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        cache: "no-store",
      });
      if (!res.ok) {
        // If 403 → viewer or not a member; surface gracefully
        if (res.status === 403) {
          setSaveStatus({ type: "error", message: "You do not have permission to view these settings." });
        }
        return;
      }
      const data = await res.json();
      const proj: ProjectSettings = data.project;
      setSettings(proj);
      // Default to the stored value, or 30 days if null
      const stored = proj.retention_days;
      if (stored && RETENTION_OPTIONS.some((o) => o.value === stored)) {
        setSelectedDays(stored as RetentionValue);
      }
    } catch (err) {
      console.warn("[ProjectRetentionSettings] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (readonly) return;
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

      // Optimistic update of local state
      setSettings((prev) =>
        prev ? { ...prev, retention_days: data.project.retention_days } : prev
      );
      setSaveStatus({ type: "success", message: "Data retention policy saved." });
      // Clear success badge after 3 s
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
              {readonly && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  READ-ONLY
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configure how long telemetry logs are retained for this project.
            </p>
          </div>
        </div>

        {/* Role badge */}
        {userRole && (
          <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold font-mono bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 uppercase tracking-wider">
            <ShieldCheck className="h-3 w-3 text-indigo-400" />
            {userRole}
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
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 text-xs font-mono">
            <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="text-zinc-400">Current policy:</span>
            <span className="text-zinc-100 font-semibold">
              {settings?.retention_days != null
                ? `${settings.retention_days} days`
                : "Not configured (default 30 days)"}
            </span>
          </div>

          {/* Option grid */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2.5">
              Retention Period
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {RETENTION_OPTIONS.map((option) => {
                const isSelected = selectedDays === option.value;
                return (
                  <button
                    key={option.value}
                    id={`retention-option-${option.value}`}
                    type="button"
                    disabled={readonly}
                    onClick={() => setSelectedDays(option.value)}
                    className={`
                      flex flex-col items-center justify-center p-3 rounded-xl border text-center
                      transition-all duration-150 font-sans
                      ${readonly
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5"
                      }
                      ${isSelected
                        ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-500/10"
                        : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400"
                      }
                    `}
                    aria-pressed={isSelected}
                  >
                    <span className={`text-base font-bold font-mono ${isSelected ? "text-indigo-300" : "text-zinc-200"}`}>
                      {option.value}
                    </span>
                    <span className="text-[10px] font-medium mt-0.5">days</span>
                    <span className={`text-[10px] mt-1 ${isSelected ? "text-indigo-400" : "text-zinc-600"}`}>
                      {option.description}
                    </span>
                  </button>
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
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {saveStatus.message}
                  </span>
                )}
                {saveStatus.type === "error" && (
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {saveStatus.message}
                  </span>
                )}
                {saveStatus.type === "idle" && isDirty && (
                  <span className="text-zinc-500">
                    Unsaved changes — selected{" "}
                    <span className="text-zinc-300 font-semibold font-mono">{selectedDays} days</span>
                    {currentOption ? ` (${currentOption.description})` : ""}
                  </span>
                )}
              </div>

              {/* Save button */}
              <button
                id="save-retention-btn"
                type="button"
                onClick={handleSave}
                disabled={saveStatus.type === "saving" || !isDirty}
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
            <span className="font-semibold text-zinc-500">Note:</span> Logs older than the selected retention period will be automatically purged by the nightly cleanup job.
            Changes apply to new data immediately and historic data within 24 hours.
            Only <span className="text-zinc-400 font-semibold">admin</span> and <span className="text-zinc-400 font-semibold">owner</span> roles may modify this policy.
          </p>
        </>
      )}
    </div>
  );
}
