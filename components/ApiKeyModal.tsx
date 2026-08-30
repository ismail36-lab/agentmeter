"use client";

import React, { useState } from "react";
import { Key, Plus, Copy, CheckCircle2, AlertCircle, X, ShieldCheck, Loader2 } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCreated: (newKeyObj: { id: string; name: string; key: string }) => void;
}

export function ApiKeyModal({ isOpen, onClose, onKeyCreated }: ApiKeyModalProps) {
  const [keyName, setKeyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() || "Default Key" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate API key");
      }

      if (data.key) {
        setGeneratedKey(data.key.key);
        onKeyCreated(data.key);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate API key");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setKeyName("");
    setGeneratedKey(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl text-zinc-100 p-6 space-y-5">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-50">
                {generatedKey ? "Save Secret API Key" : "Generate New API Key"}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {generatedKey
                  ? "Copy your secret API key now. It won't be shown again."
                  : "Create an authentication key for telemetry log ingestion."}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors self-end sm:self-auto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        {!generatedKey ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Key Identifier / Label
              </label>
              <input
                type="text"
                placeholder="e.g., Production Server, Agent Runner, Staging"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/60 transition-all font-mono"
              />
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Give your API key a descriptive name to easily track telemetry logs by key.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors border border-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-sm disabled:opacity-40"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Generate Key</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Keep this secret key safe!</span>
              </div>
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                For security reasons, this secret key will never be displayed in full again. Store it in your environment variables or secret store now.
              </p>
            </div>

            {/* Secret Display Box */}
            <div className="relative group">
              <div className="w-full bg-[#0c0d0e] border border-zinc-800 rounded-lg p-3.5 text-xs font-mono text-indigo-300 break-all pr-24 selection:bg-indigo-950">
                {generatedKey}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-2 top-2 bottom-2 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Key</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium transition-colors border border-zinc-800"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
