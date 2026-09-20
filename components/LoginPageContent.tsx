"use client";

import React, { useState, useEffect, useRef } from "react";
import { Zap, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle, Building2, Globe } from "lucide-react";
import { supabase, syncSessionCookie } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { loginWithSSO } from "@/lib/auth/sso";

export type AuthMode = "login" | "signup";

export function LoginPageContent({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showSSO, setShowSSO] = useState(false);
  const [ssoInput, setSsoInput] = useState("");
  const [isSsoLoading, setIsSsoLoading] = useState(false);
  const toast = useToast();

  const hasRedirectedRef = useRef(false);

  // Helper to get destination URL from query params.
  // Strict safe-relative-path validation to prevent open-redirect attacks:
  //   ✅ Must start with a single "/"
  //   ❌ Must NOT start with "//" (blocks protocol-relative URLs like //evil.com)
  //   ❌ Must NOT start with "/\" or "\" (blocks backslash bypass tricks like /\evil.com)
  const getNextDestination = () => {
    if (typeof window === "undefined") return "/dashboard";
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");

    const isSafeRelativePath =
      typeof next === "string" &&
      next.startsWith("/") &&       // must begin with a single slash
      !next.startsWith("//") &&     // block protocol-relative URLs (//evil.com)
      !next.startsWith("/\\") &&    // block /\evil.com backslash bypass
      !next.startsWith("\\");       // block \evil.com backslash bypass

    return isSafeRelativePath ? next : "/dashboard";
  };

  // If already logged in, redirect to destination/dashboard ONCE
  useEffect(() => {
    let isMounted = true;

    async function checkInitialSession() {
      try {
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (sessionErr) {
          console.warn("Invalid auth session detected on login page:", sessionErr.message);
          await supabase.auth.signOut().catch(() => {});
          syncSessionCookie(null);
          return;
        }

        if (data?.session && !hasRedirectedRef.current) {
          // Verify user actually exists in Auth backend (handles deleted user accounts cleanly)
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userData?.user) {
            console.warn("Session user no longer exists or is invalid:", userErr?.message);
            await supabase.auth.signOut().catch(() => {});
            syncSessionCookie(null);
            return;
          }

          hasRedirectedRef.current = true;
          syncSessionCookie(data.session);
          window.location.href = getNextDestination();
        }
      } catch (err) {
        console.error("Error during initial session verification:", err);
        if (isMounted) {
          await supabase.auth.signOut().catch(() => {});
          syncSessionCookie(null);
        }
      }
    }

    checkInitialSession();

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
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
          setIsLoading(false);
          return;
        }
        if (data.session) {
          syncSessionCookie(data.session);
        }
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          window.location.href = getNextDestination();
        }
      } else {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });

        const signupData = await res.json().catch(() => null);

        if (!res.ok || !signupData?.success) {
          setError(signupData?.details || signupData?.error || "Registration failed. Please try again.");
          setIsLoading(false);
          return;
        }

        // Try signing in automatically after successful registration
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError && signInData?.session) {
          syncSessionCookie(signInData.session);
          if (!hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            window.location.href = getNextDestination();
            return;
          }
        }

        setSuccessMsg(
          "Account created successfully! A welcome email has been sent to your inbox."
        );
        setMode("login");
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err?.message ?? "An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  const handleSSOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSsoLoading(true);

    let domain = ssoInput.trim().toLowerCase();
    if (domain.includes("@")) {
      domain = domain.split("@").pop()?.trim() || "";
    }
    domain = domain.replace(/^https?:\/\//i, "").split("/")[0];

    if (!domain || !domain.includes(".") || domain.length < 3) {
      const errMsg = "Please enter a valid corporate email or domain (e.g., user@company.com or company.com).";
      setError(errMsg);
      toast.error(errMsg, "Invalid SSO Domain");
      setIsSsoLoading(false);
      return;
    }

    try {
      const destination = getNextDestination();
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${destination}` : undefined;
      const result = await loginWithSSO(domain, { redirectTo });

      if (!result.success) {
        const errMsg = result.error || "Single Sign-On is not configured or failed for this domain.";
        setError(errMsg);
        toast.error(errMsg, "SSO Login Failed");
        setIsSsoLoading(false);
      }
    } catch (err: any) {
      const errMsg = err?.message || "An error occurred during Single Sign-On initiation.";
      setError(errMsg);
      toast.error(errMsg, "SSO Error");
      setIsSsoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center px-4 py-6 selection:bg-indigo-500/20 w-full max-w-full overflow-x-hidden">

      {/* Glow background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50 font-sans">
            Meterix
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
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider font-sans">
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
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-10 pr-11 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
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
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              id="auth-submit-btn"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-sm disabled:cursor-not-allowed"
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

          {/* SSO Section */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-wider">
              <span className="bg-[#121623] px-2 text-zinc-500">Enterprise SSO</span>
            </div>
          </div>

          {!showSSO ? (
            <button
              type="button"
              id="sso-toggle-btn"
              onClick={() => {
                setShowSSO(true);
                setError(null);
                setSuccessMsg(null);
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-sm"
            >
              <Building2 className="h-4 w-4 text-indigo-400" />
              <span>Sign in with Enterprise SSO</span>
            </button>
          ) : (
            <form onSubmit={handleSSOSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="sso-domain" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Corporate Email or Domain
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSSO(false);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 font-mono transition-colors"
                  >
                    ← Password Login
                  </button>
                </div>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 pointer-events-none" />
                  <input
                    id="sso-domain"
                    type="text"
                    required
                    placeholder="you@company.com or company.com"
                    value={ssoInput}
                    onChange={(e) => setSsoInput(e.target.value)}
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                id="sso-submit-btn"
                disabled={isSsoLoading}
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-sm disabled:cursor-not-allowed"
              >
                {isSsoLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Redirecting to IdP…</span>
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4" />
                    <span>Continue with SSO</span>
                  </>
                )}
              </button>
            </form>
          )}

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
        <p className="mt-6 text-center text-xs text-zinc-600 font-mono">
          Meterix Infrastructure • v1.0.0
        </p>
      </div>
    </div>
  );
}
