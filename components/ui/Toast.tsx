"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
  error: (message: string, title?: string, duration?: number) => string;
  warning: (message: string, title?: string, duration?: number) => string;
  success: (message: string, title?: string, duration?: number) => string;
  info: (message: string, title?: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, "id">): string => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const error = useCallback(
    (message: string, title: string = "Error", duration?: number) => {
      return addToast({ type: "error", title, message, duration });
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, title: string = "Warning", duration?: number) => {
      return addToast({ type: "warning", title, message, duration });
    },
    [addToast]
  );

  const success = useCallback(
    (message: string, title: string = "Success", duration?: number) => {
      return addToast({ type: "success", title, message, duration });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, title: string = "Info", duration?: number) => {
      return addToast({ type: "info", title, message, duration });
    },
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, error, warning, success, info }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full px-4 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const getStyles = () => {
    switch (toast.type) {
      case "error":
        return {
          container: "bg-zinc-900/95 border-rose-500/40 text-rose-100 shadow-rose-950/20",
          iconBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
          icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />,
          titleColor: "text-rose-300",
        };
      case "warning":
        return {
          container: "bg-zinc-900/95 border-amber-500/40 text-amber-100 shadow-amber-950/20",
          iconBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
          titleColor: "text-amber-300",
        };
      case "success":
        return {
          container: "bg-zinc-900/95 border-emerald-500/40 text-emerald-100 shadow-emerald-950/20",
          iconBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
          titleColor: "text-emerald-300",
        };
      case "info":
      default:
        return {
          container: "bg-zinc-900/95 border-indigo-500/40 text-indigo-100 shadow-indigo-950/20",
          iconBg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
          icon: <Info className="h-4 w-4 shrink-0 text-indigo-400" />,
          titleColor: "text-indigo-300",
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`pointer-events-auto relative flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 font-sans ${styles.container}`}
      role="alert"
    >
      <div className={`p-1.5 rounded-lg border shrink-0 ${styles.iconBg}`}>
        {styles.icon}
      </div>

      <div className="flex-1 min-w-0 pr-2">
        {toast.title && (
          <h4 className={`text-xs font-semibold tracking-wide uppercase font-mono ${styles.titleColor}`}>
            {toast.title}
          </h4>
        )}
        <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed font-sans break-words">
          {toast.message}
        </p>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
        aria-label="Close notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
