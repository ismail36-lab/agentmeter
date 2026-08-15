"use client";

import React, { useState, useEffect, useRef } from "react";
import { Zap, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { supabase, syncSessionCookie } from "@/lib/supabase";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const hasRedirectedRef = useRef(false);

  // Helper to get destination URL from query params
  const getNextDestination = () => {
    if (typeof window === "undefined") return "/dashboard";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  };

  // If already logged in, redirect to destination/dashboard ONCE
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data.session && !hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        syncSessionCookie(data.session);
        window.location.href = getNextDestination();
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const urlPlan = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("plan") || "free"
        : "free";

      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
          setIsLoading(false);
          return;
        }
        if (data.session) {
          syncSessionCookie(data.session);
          if (urlPlan && urlPlan !== "free") {
            try {
              await fetch("/api/plan", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${data.session.access_token}`,
                },
                body: JSON.stringify({ plan: urlPlan }),
              });
            } catch {}
          }
        }
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          window.location.href = getNextDestination();
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { plan: urlPlan },
          },
        });
        if (error) {
          setError(error.message);
          setIsLoading(false);
          return;
        }
        setSuccessMsg(
          "Account created! Check your email to confirm your address, then sign in."
        );
        setMode("login");
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center px-4 selection:bg-emerald-500/20">

      {/* Background decorative glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/5">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            AgentMeter
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        {/* Auth card */}
        <div className="bento-card p-8">

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800 mb-6">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                mode === "login"
                  ? "bg-zinc-800 text-zinc-50 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                mode === "signup"
                  ? "bg-zinc-800 text-zinc-50 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-11 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-emerald-400 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              id="auth-submit-btn"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-500/10 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === "login" ? "Signing in…" : "Creating account…"}</span>
                </>
              ) : (
                <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
              )}
            </button>
          </form>

          {/* Divider info */}
          <p className="mt-6 text-center text-xs text-zinc-600">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); }}
                  className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Footer badge */}
        <p className="mt-6 text-center text-xs text-zinc-700 font-mono">
          Secured by Supabase Auth • AgentMeter v1.0.0
        </p>
      </div>
    </div>
  );
}
