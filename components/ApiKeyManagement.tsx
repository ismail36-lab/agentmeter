"use client";

import React, { useState } from "react";
import { Key, Plus, Copy, CheckCircle2, Trash2, Eye, EyeOff, Loader2, Search, AlertCircle, RefreshCw } from "lucide-react";
import { ApiKeyModal } from "./ApiKeyModal";

export interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at: string;
}

interface ApiKeyManagementProps {
  apiKeys: ApiKeyItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onKeyCreated: (newKey: ApiKeyItem) => void;
  onKeyRevoked: (keyId: string) => void;
}

export function ApiKeyManagement({
  apiKeys,
  isLoading,
  onRefresh,
  onKeyCreated,
  onKeyRevoked,
}: ApiKeyManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});

  const toggleVisibility = (id: string) => {
    setVisibleKeyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      if (res.ok) {
        onKeyRevoked(keyId);
      }
    } catch (err) {
      console.warn("Failed to revoke key:", err);
    } finally {
      setRevokingId(null);
    }
  };

  const handleHardDelete = async (keyId: string) => {
    if (!confirm("Are you sure you want to permanently delete this API key?")) return;
    setDeletingId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}?hard=true`, { method: "DELETE" });
      if (res.ok) {
        onKeyRevoked(keyId);
      }
    } catch (err) {
      console.warn("Failed to delete key:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredKeys = apiKeys.filter((k) =>
    k.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bento-card p-6 space-y-5 w-full">
      {/* Header & Main Action */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50 flex items-center gap-2 font-sans tracking-tight">
            <Key className="h-4 w-4 text-indigo-400" />
            API Key Management
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5 font-sans">
            Manage authentication keys used by Meterix SDK and HTTP endpoints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-800 disabled:opacity-40"
            title="Refresh keys"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="py-2 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Generate New API Key</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      {apiKeys.length > 0 && (
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search API keys by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 font-mono transition-all"
          />
        </div>
      )}

      {/* Table Container */}
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900/50 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
            <tr>
              <th className="py-3 px-4">Key Name</th>
              <th className="py-3 px-4">Secret Key</th>
              <th className="py-3 px-4">Created Date</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-indigo-400" />
                  Fetching API keys from Supabase...
                </td>
              </tr>
            ) : filteredKeys.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  {apiKeys.length === 0
                    ? 'No API keys found. Click "Generate New API Key" above to create one.'
                    : "No keys matching your search filter."}
                </td>
              </tr>
            ) : (
              filteredKeys.map((item) => {
                const isVisible = Boolean(visibleKeyIds[item.id]);
                const maskedKey = item.key.length > 12
                  ? `${item.key.slice(0, 10)}••••••••••••••••••••`
                  : item.key;
                const displayKey = isVisible ? item.key : maskedKey;

                return (
                  <tr key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-zinc-200">{item.name}</td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-300 truncate break-all max-w-[180px] sm:max-w-xs block">{displayKey}</span>
                        <button
                          type="button"
                          onClick={() => toggleVisibility(item.id)}
                          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                          title={isVisible ? "Hide Key" : "Show Key"}
                        >
                          {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {new Date(item.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.key, item.id)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors border border-zinc-800"
                          title="Copy Key"
                        >
                          {copiedId === item.id ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {item.is_active ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(item.id)}
                            disabled={revokingId === item.id}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-[11px] font-medium transition-colors border border-amber-500/20 disabled:opacity-40"
                            title="Revoke Key"
                          >
                            {revokingId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                            ) : null}
                            Revoke
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleHardDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-500/20 disabled:opacity-40"
                          title="Delete Key"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
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

      {/* Modal */}
      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onKeyCreated={(newKey) => {
          onKeyCreated({
            id: newKey.id,
            name: newKey.name,
            key: newKey.key,
            is_active: true,
            created_at: new Date().toISOString(),
          });
        }}
      />
    </div>
  );
}
