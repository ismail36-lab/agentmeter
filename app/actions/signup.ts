"use server";

import { Resend } from "resend";
import { getSupabaseAdminClient } from "@/lib/supabase";

export interface SignupActionInput {
  email: string;
  password: string;
  plan?: string;
}

export interface SignupActionSuccessResult {
  success: true;
  message: string;
  user: {
    id: string;
    email: string;
    plan?: string;
  };
  emailSent: boolean;
  emailId?: string;
  emailError?: string;
}

export interface SignupActionErrorResult {
  success: false;
  error: string;
  details?: string;
}

export type SignupActionResult = SignupActionSuccessResult | SignupActionErrorResult;

/**
 * Server Action for user signup.
 * Validates inputs, registers user via Supabase Admin Client, and dispatches a welcome email via Resend (from support@meterix.dev).
 */
export async function signupUserAction(input: SignupActionInput): Promise<SignupActionResult> {
  try {
    const { email, password, plan } = input || {};

    // 1. Validation
    if (!email || typeof email !== "string" || !email.trim()) {
      return {
        success: false,
        error: "Validation Error",
        details: "A valid email string is required",
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return {
        success: false,
        error: "Validation Error",
        details: "Invalid email address format",
      };
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return {
        success: false,
        error: "Validation Error",
        details: "Password must be at least 6 characters long",
      };
    }

    const cleanEmail = email.trim().toLowerCase();
    const userPlan = plan || "free";

    // 2. Supabase User Registration
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { plan: userPlan },
      },
    });

    if (authError) {
      console.error("[signup-action] Supabase registration error:", authError);
      return {
        success: false,
        error: "Registration Failed",
        details: authError.message,
      };
    }

    if (!authData.user) {
      return {
        success: false,
        error: "Registration Failed",
        details: "User object was not returned by Supabase",
      };
    }

    const userId = authData.user.id;
    const userRegisteredEmail = authData.user.email || cleanEmail;

    // 3. Resend Email Dispatch
    let emailSent = false;
    let emailId: string | undefined;
    let emailErrorMsg: string | undefined;

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL || "Meterix <support@meterix.dev>";

    if (!apiKey) {
      console.warn("[signup-action] Warning: RESEND_API_KEY is not configured.");
      emailErrorMsg = "RESEND_API_KEY is not configured on the server.";
    } else {
      try {
        const resend = new Resend(apiKey);
        const { data: resendData, error: resendError } = await resend.emails.send({
          from: fromAddress,
          to: [userRegisteredEmail],
          subject: "Welcome to Meterix!",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #27272a;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #6366f1; margin: 0; font-size: 24px; font-weight: 700;">Meterix</h1>
                <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Developer AI Metering & Telemetry Platform</p>
              </div>
              <div style="background-color: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a;">
                <h2 style="color: #f4f4f5; font-size: 18px; margin-top: 0;">Welcome aboard!</h2>
                <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6;">
                  Thank you for creating an account with <strong>Meterix</strong>. Your registration is complete and your account is ready.
                </p>
                <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6;">
                  Selected Plan: <span style="color: #818cf8; font-weight: 600;">${userPlan.toUpperCase()}</span>
                </p>
              </div>
              <div style="margin-top: 24px; font-size: 12px; color: #71717a; text-align: center;">
                If you have any questions or need support, reply directly to this email or contact us at <a href="mailto:support@meterix.dev" style="color: #818cf8; text-decoration: none;">support@meterix.dev</a>.
              </div>
            </div>
          `,
          text: `Welcome to Meterix!\n\nThank you for creating an account with Meterix. Your registration is complete.\n\nSelected Plan: ${userPlan.toUpperCase()}\n\nIf you need support, reply to this email or contact support@meterix.dev.`,
        });

        if (resendError) {
          console.error("[signup-action] Resend email send error:", resendError);
          emailErrorMsg = resendError.message || String(resendError);
        } else if (resendData?.id) {
          emailSent = true;
          emailId = resendData.id;
          console.log(`[signup-action] Welcome email successfully sent via Resend (ID: ${resendData.id}) from support@meterix.dev to ${userRegisteredEmail}`);
        }
      } catch (e: any) {
        console.error("[signup-action] Unexpected error sending email with Resend:", e);
        emailErrorMsg = e?.message || String(e);
      }
    }

    return {
      success: true,
      message: "User registered successfully",
      user: {
        id: userId,
        email: userRegisteredEmail,
        plan: userPlan,
      },
      emailSent,
      ...(emailId && { emailId }),
      ...(emailErrorMsg && { emailError: emailErrorMsg }),
    };
  } catch (err: any) {
    console.error("[signup-action] Unexpected signup action error:", err);
    return {
      success: false,
      error: "Internal Error",
      details: err?.message || String(err),
    };
  }
}
