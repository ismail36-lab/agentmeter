"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  Building2,
  Mail,
  User,
  MessageSquare,
  Zap,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_SIZE_OPTIONS = [
  { value: "", label: "Select team size…" },
  { value: "1-5", label: "1 – 5 people (Startup / Solo)" },
  { value: "6-20", label: "6 – 20 people (Small Team)" },
  { value: "21-50", label: "21 – 50 people (Growth Stage)" },
  { value: "51-200", label: "51 – 200 people (Scale-Up)" },
  { value: "201-500", label: "201 – 500 people (Mid-Market)" },
  { value: "500+", label: "500+ people (Enterprise)" },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  email: string;
  company: string;
  team_size: string;
  use_case: string;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

interface FieldError {
  name?: string;
  email?: string;
  company?: string;
  team_size?: string;
  use_case?: string;
}

interface TalkToSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional pre-fill for context (e.g., "Enterprise Plan") */
  context?: string;
}

// ---------------------------------------------------------------------------
// Validation (client-side mirror of server validation)
// ---------------------------------------------------------------------------

function validate(form: FormState): FieldError {
  const errs: FieldError = {};
  if (!form.name.trim() || form.name.trim().length < 2)
    errs.name = "Please enter your full name";
  if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errs.email = "Please enter a valid business email";
  if (!form.company.trim() || form.company.trim().length < 2)
    errs.company = "Please enter your company name";
  if (!form.team_size)
    errs.team_size = "Please select your team size";
  if (!form.use_case.trim() || form.use_case.trim().length < 10)
    errs.use_case = "Please describe your use case (min 10 characters)";
  return errs;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldWrapProps {
  label: string;
  htmlFor: string;
  error?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  required?: boolean;
}

function FieldWrap({ label, htmlFor, error, icon: Icon, children, required }: FieldWrapProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        <Icon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        {label}
        {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-rose-400 font-sans">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full bg-zinc-900 border ${
    hasError ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/40" : "border-zinc-800 focus:border-indigo-500/60 focus:ring-indigo-500/30"
  } rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-600
   focus:outline-none focus:ring-1 transition-all duration-150 font-sans`;

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export function TalkToSalesModal({ isOpen, onClose, context }: TalkToSalesModalProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    company: "",
    team_size: "",
    use_case: "",
  });
  const [errors, setErrors] = useState<FieldError>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Validate on every change but only show errors for touched fields
  useEffect(() => {
    setErrors(validate(form));
  }, [form]);

  // Trap Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleClose = () => {
    // Reset only after a short delay so the success screen is still visible as modal fades
    setTimeout(() => {
      setForm({ name: "", email: "", company: "", team_size: "", use_case: "" });
      setErrors({});
      setTouched({});
      setSubmitStatus("idle");
      setServerError(null);
    }, 200);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Touch all fields to surface all errors at once
    setTouched({ name: true, email: true, company: true, team_size: true, use_case: true });
    const currentErrors = validate(form);
    if (Object.keys(currentErrors).length > 0) return;

    setSubmitStatus("submitting");
    setServerError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          company: form.company.trim(),
          team_size: form.team_size,
          use_case: form.use_case.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Submission failed. Please try again.");
      }

      setSubmitStatus("success");
    } catch (err: any) {
      setServerError(err.message ?? "Something went wrong. Please try again.");
      setSubmitStatus("error");
    }
  };

  const isSubmitting = submitStatus === "submitting";
  const isSuccess = submitStatus === "success";

  const visibleError = (field: keyof FormState) =>
    touched[field] ? errors[field] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      aria-modal="true"
      role="dialog"
      aria-labelledby="sales-modal-title"
    >
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* ── Gradient accent bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />

        <div className="p-6 space-y-5">
          {/* ── Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 id="sales-modal-title" className="text-base font-semibold text-zinc-50 leading-tight">
                  Talk to Sales
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {context
                    ? `Interested in ${context}? `
                    : ""}
                  We'll follow up within 1 business day.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0 mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Success State */}
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-zinc-50">
                  Enquiry Received!
                </h3>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Thanks,{" "}
                  <span className="text-zinc-200 font-medium">{form.name.split(" ")[0]}</span>!
                  A member of our sales team will reach out to{" "}
                  <span className="text-indigo-400 font-mono">{form.email}</span>{" "}
                  within 1 business day.
                </p>
              </div>
              <button
                id="sales-modal-done-btn"
                onClick={handleClose}
                className="mt-2 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-sm"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Form */
            <form id="talk-to-sales-form" onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Row: Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldWrap label="Full Name" htmlFor="lead-name" error={visibleError("name")} icon={User} required>
                  <input
                    ref={firstInputRef}
                    id="lead-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={set("name")}
                    disabled={isSubmitting}
                    className={inputCls(!!visibleError("name"))}
                  />
                </FieldWrap>

                <FieldWrap label="Work Email" htmlFor="lead-email" error={visibleError("email")} icon={Mail} required>
                  <input
                    id="lead-email"
                    type="email"
                    autoComplete="email"
                    placeholder="jane@company.com"
                    value={form.email}
                    onChange={set("email")}
                    disabled={isSubmitting}
                    className={inputCls(!!visibleError("email"))}
                  />
                </FieldWrap>
              </div>

              {/* Row: Company + Team Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldWrap label="Company Name" htmlFor="lead-company" error={visibleError("company")} icon={Building2} required>
                  <input
                    id="lead-company"
                    type="text"
                    autoComplete="organization"
                    placeholder="Acme Corp"
                    value={form.company}
                    onChange={set("company")}
                    disabled={isSubmitting}
                    className={inputCls(!!visibleError("company"))}
                  />
                </FieldWrap>

                <FieldWrap label="Team Size" htmlFor="lead-team-size" error={visibleError("team_size")} icon={Users} required>
                  <select
                    id="lead-team-size"
                    value={form.team_size}
                    onChange={set("team_size")}
                    disabled={isSubmitting}
                    className={`${inputCls(!!visibleError("team_size"))} appearance-none cursor-pointer`}
                  >
                    {TEAM_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FieldWrap>
              </div>

              {/* Use Case */}
              <FieldWrap label="Use Case / What are you building?" htmlFor="lead-use-case" error={visibleError("use_case")} icon={MessageSquare} required>
                <textarea
                  id="lead-use-case"
                  rows={3}
                  placeholder="Describe how you plan to use Meterix — e.g., monitoring 10 GPT-4o agents in production, multi-tenant cost attribution across 50 customers…"
                  value={form.use_case}
                  onChange={set("use_case")}
                  disabled={isSubmitting}
                  className={`${inputCls(!!visibleError("use_case"))} resize-none`}
                />
                <p className="text-[11px] text-zinc-600 -mt-0.5">
                  {form.use_case.trim().length} / 10 characters minimum
                </p>
              </FieldWrap>

              {/* Server-level error banner */}
              {submitStatus === "error" && serverError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-zinc-600 font-sans leading-tight">
                  By submitting you agree to our{" "}
                  <a href="/privacy" target="_blank" className="underline hover:text-zinc-400 transition-colors">
                    Privacy Policy
                  </a>
                  .
                </p>
                <button
                  id="lead-submit-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="
                    inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                    bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500
                    text-white disabled:cursor-not-allowed text-xs font-medium
                    transition-all duration-150 shadow-sm shrink-0
                  "
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Get in Touch
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger button — drop-in anywhere across the marketing pages
// ---------------------------------------------------------------------------

interface TalkToSalesTriggerProps {
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  context?: string;
  className?: string;
  id?: string;
}

/**
 * Self-contained "Talk to Sales" trigger button that manages its own modal state.
 * Import and drop into any page without needing to lift state.
 */
export function TalkToSalesTrigger({
  variant = "primary",
  label = "Talk to Sales",
  context,
  className = "",
  id,
}: TalkToSalesTriggerProps) {
  const [open, setOpen] = useState(false);

  const base =
    "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 shadow-sm";

  const variants: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
    secondary: "bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200",
    ghost: "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-indigo-500/20",
  };

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} ${variants[variant]} ${className}`}
      >
        <Users className="h-3.5 w-3.5" />
        {label}
      </button>
      <TalkToSalesModal isOpen={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
}
