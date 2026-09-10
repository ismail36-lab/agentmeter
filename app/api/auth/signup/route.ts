import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "react-email";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { WelcomeEmail } from "@/emails/WelcomeEmail";

export const dynamic = "force-dynamic";

export interface SignupRequestBody {
  email: string;
  password: string;
  plan?: string;
}

export interface SignupSuccessResponse {
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

export interface SignupErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export type SignupResponse = SignupSuccessResponse | SignupErrorResponse;

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(req: NextRequest): Promise<NextResponse<SignupResponse>> {
  try {
    const body = (await req.json().catch(() => null)) as SignupRequestBody | null;

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Invalid Request", details: "JSON body is required" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const { email, password, plan } = body;

    // 1. Validation
    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "Validation Error", details: "A valid email string is required" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: "Validation Error", details: "Invalid email address format" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Validation Error", details: "Password must be at least 6 characters long" },
        { status: 400, headers: getCorsHeaders() }
      );
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
      console.error("[signup-api] Supabase registration error:", authError);
      return NextResponse.json(
        { success: false, error: "Registration Failed", details: authError.message },
        { status: 422, headers: getCorsHeaders() }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { success: false, error: "Registration Failed", details: "User object was not created by Supabase" },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    const userId = authData.user.id;
    const userRegisteredEmail = authData.user.email || cleanEmail;

    // 3. Resend Welcome Email using WelcomeEmail React Email template
    let emailSent = false;
    let emailId: string | undefined;
    let emailErrorMsg: string | undefined;

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.warn("[signup-api] Warning: RESEND_API_KEY environment variable is missing.");
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
          console.error("[signup-api] Resend email send error:", resendError);
          emailErrorMsg = resendError.message || String(resendError);
        } else if (resendData?.id) {
          emailSent = true;
          emailId = resendData.id;
          console.log(`[signup-api] Welcome email successfully sent via Resend (ID: ${resendData.id}) from support@meterix.dev to ${userRegisteredEmail}`);
        }
      } catch (e: any) {
        console.error("[signup-api] Unexpected error sending email with Resend:", e);
        emailErrorMsg = e?.message || String(e);
      }
    }

    // 4. Return Success Response
    return NextResponse.json(
      {
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
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (err: any) {
    console.error("[signup-api] Unexpected signup API error:", err);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", details: err?.message || String(err) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
