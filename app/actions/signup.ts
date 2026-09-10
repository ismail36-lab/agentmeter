"use server";

import { Resend } from "resend";
import { render } from "react-email";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { WelcomeEmail } from "@/emails/WelcomeEmail";

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
 * Validates inputs, registers user via Supabase Admin Client, and dispatches a
 * welcome email via Resend (from 'Meterix <support@meterix.dev>') using the
 * WelcomeEmail React Email template.
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

    // 3. Resend Email Dispatch using WelcomeEmail React Email template
    let emailSent = false;
    let emailId: string | undefined;
    let emailErrorMsg: string | undefined;

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.warn("[signup-action] Warning: RESEND_API_KEY is not configured.");
      emailErrorMsg = "RESEND_API_KEY is not configured on the server.";
    } else {
      try {
        const resend = new Resend(apiKey);

        // Render React Email template to HTML
        const html = await render(
          WelcomeEmail({ userEmail: userRegisteredEmail, plan: userPlan })
        );

        const { data: resendData, error: resendError } = await resend.emails.send({
          from: "Meterix <support@meterix.dev>",
          to: [userRegisteredEmail],
          subject: "Welcome to Meterix!",
          html,
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
