import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Internal authentication guard
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  const internalSecret = process.env.INTERNAL_API_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    !!token &&
    ((!!internalSecret && token === internalSecret) ||
      (!!cronSecret && token === cronSecret));

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized internal service call" },
      { status: 401 }
    );
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("[send-email] Missing RESEND_API_KEY environment variable.");
      return NextResponse.json(
        { error: "Server Configuration Error", details: "RESEND_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid Request", details: "JSON body is required" },
        { status: 400 }
      );
    }

    const { to, subject, html, text, from, reply_to, cc, bcc } = body;

    if (!to || (!Array.isArray(to) && typeof to !== "string")) {
      return NextResponse.json(
        { error: "Validation Error", details: "Field 'to' (string or array of email addresses) is required" },
        { status: 400 }
      );
    }

    if (!subject || typeof subject !== "string") {
      return NextResponse.json(
        { error: "Validation Error", details: "Field 'subject' (string) is required" },
        { status: 400 }
      );
    }

    if (!html && !text) {
      return NextResponse.json(
        { error: "Validation Error", details: "At least one of 'html' or 'text' body content must be provided" },
        { status: 400 }
      );
    }

    const defaultFrom = process.env.RESEND_FROM_EMAIL || "Meterix <onboarding@resend.dev>";
    const sender = from || defaultFrom;

    const resend = new Resend(apiKey);

    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: sender,
      to,
      subject,
      ...(html && { html }),
      ...(text && { text }),
      ...(reply_to && { reply_to }),
      ...(cc && { cc }),
      ...(bcc && { bcc }),
    };

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("[send-email] Resend API error:", error);
      return NextResponse.json(
        { error: "Failed to send email", details: error.message || error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: data?.id,
        message: "Email sent successfully",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[send-email] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message || String(err) },
      { status: 500 }
    );
  }
}

