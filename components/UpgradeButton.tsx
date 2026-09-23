"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

export interface UpgradeButtonProps {
  /** Logged-in user's email address */
  userEmail?: string;
  /** Logged-in user's Supabase UUID */
  userId?: string;
  /** Direct LemonSqueezy checkout URL (optional override) */
  checkoutUrl?: string;
  /** Custom plan label (defaults to "$99/mo Pro Plan") */
  planName?: string;
  /** Additional custom Tailwind CSS classes */
  className?: string;
  /** Optional custom button content */
  children?: React.ReactNode;
  /** Callback fired prior to redirecting */
  onRedirectStart?: () => void;
}

export const UpgradeButton: React.FC<UpgradeButtonProps> = ({
  userEmail,
  userId,
  checkoutUrl,
  planName = "$99/mo Pro Plan",
  className = "",
  children,
  onRedirectStart,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpgradeClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    if (onRedirectStart) {
      onRedirectStart();
    }

    try {
      // 1. Determine base checkout URL
      let baseCheckoutUrl =
        checkoutUrl ||
        process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL ||
        "";

      // If no direct LemonSqueezy URL is configured in env or props, attempt API route redirect
      if (!baseCheckoutUrl) {
        try {
          const res = await fetch("/api/checkout?plan=pro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_email: userEmail, user_id: userId }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              window.location.href = data.url;
              return;
            }
          }
        } catch {
          // Fallback to server route GET redirect if fetch fails
        }
        // Fallback endpoint
        baseCheckoutUrl = "/api/checkout?plan=pro";
      }

      // 2. Construct LemonSqueezy query parameters
      const url = new URL(
        baseCheckoutUrl,
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
      );

      // Attach user email if present
      if (userEmail) {
        url.searchParams.set("checkout[email]", userEmail);
        url.searchParams.set("user_email", userEmail);
      }

      // Attach user ID into custom metadata
      if (userId) {
        url.searchParams.set("checkout[custom][user_id]", userId);
        url.searchParams.set("custom_data[user_id]", userId);
        url.searchParams.set("user_id", userId);
      }

      // 3. Redirect user to LemonSqueezy checkout session
      window.location.href = url.toString();
    } catch (err: any) {
      console.error("Failed to initiate LemonSqueezy checkout redirect:", err);
      setErrorMessage("Could not start checkout. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleUpgradeClick}
        disabled={isLoading}
        aria-label={`Upgrade to ${planName}`}
        className={`relative inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 ease-in-out bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${className}`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white/90" />
            <span>Redirecting to Checkout...</span>
          </>
        ) : children ? (
          children
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Upgrade to {planName}</span>
            <ArrowRight className="w-4 h-4 ml-0.5 text-white/80 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
      {errorMessage && (
        <span className="mt-2 text-xs text-rose-400 font-medium">
          {errorMessage}
        </span>
      )}
    </div>
  );
};

export default UpgradeButton;
