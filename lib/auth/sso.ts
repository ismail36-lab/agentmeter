import { createBrowserClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSOOptions {
  /** The email domain to resolve the SAML / OIDC identity provider. */
  domain: string;
  /**
   * Override where Supabase redirects after a successful SSO login.
   * Defaults to `window.location.origin + "/dashboard"`.
   */
  redirectTo?: string;
}

export interface SSOResult {
  success: boolean;
  /** Browser was (or will be) redirected to the IdP. */
  redirected?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// loginWithSSO
// ---------------------------------------------------------------------------

/**
 * Initiate a Supabase native SSO login flow for the given email `domain`.
 *
 * Supabase looks up the registered SAML / OIDC provider for the domain and
 * returns a redirect URL that this helper immediately navigates to.
 *
 * **Must be called from client-side code only** (uses `window`).
 *
 * @param domain    Corporate email domain, e.g. `"acme.com"`.
 * @param options   Optional overrides (custom `redirectTo`).
 * @returns `SSOResult` — only returns when the IdP redirect *fails*; on
 *   success the browser navigates away before this resolves.
 *
 * @example
 * ```ts
 * const result = await loginWithSSO("acme.com");
 * if (!result.success) {
 *   console.error(result.error);
 * }
 * ```
 */
export async function loginWithSSO(
  domain: string,
  options?: Omit<SSOOptions, "domain">
): Promise<SSOResult> {
  if (typeof window === "undefined") {
    return {
      success: false,
      error: "loginWithSSO must be called in a browser environment",
    };
  }

  if (!domain || !domain.includes(".")) {
    return {
      success: false,
      error: "A valid email domain is required (e.g. \"acme.com\")",
    };
  }

  const redirectTo =
    options?.redirectTo ?? `${window.location.origin}/dashboard`;

  const supabase = createBrowserClient();

  const { data, error } = await supabase.auth.signInWithSSO({
    domain,
    options: { redirectTo },
  });

  if (error) {
    console.error("[loginWithSSO] Supabase SSO error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }

  // `data.url` is the IdP redirect URL returned by Supabase.
  if (data?.url) {
    window.location.href = data.url;
    return { success: true, redirected: true };
  }

  // Supabase may handle the redirect itself in some configurations.
  return { success: true, redirected: false };
}
