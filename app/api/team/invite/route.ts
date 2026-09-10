import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";
import { authorizeRole, Role } from "@/lib/rbac";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export interface InviteRequestBody {
  email: string;
  role?: Role;
  project_id?: string;
  projectId?: string;
}

export interface InviteSuccessResponse {
  success: true;
  message: string;
  invitation: {
    id: string;
    email: string;
    role: Role;
    token: string;
    invite_link: string;
    expires_at: string;
  };
  email_sent: boolean;
  email_id?: string;
  email_error?: string;
}

export interface InviteErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export type InviteResponse = InviteSuccessResponse | InviteErrorResponse;

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

export async function POST(req: NextRequest): Promise<NextResponse<InviteResponse>> {
  try {
    // 1. Authenticate calling user
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", details: "Authentication required to invite team members" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Parse & validate request body
    const body = (await req.json().catch(() => null)) as InviteRequestBody | null;

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Invalid Request", details: "JSON body is required" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const { email, role, project_id, projectId } = body;
    const targetProjectId = project_id || projectId || null;

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "Validation Error", details: "Target email address is required" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: "Validation Error", details: "Invalid target email address format" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // Validate role
    const validRoles: Role[] = ["owner", "admin", "member", "viewer"];
    const targetRole: Role = role && validRoles.includes(role) ? role : "member";

    // 3. Authorization check if targetProjectId is provided
    if (targetProjectId) {
      const authResult = await authorizeRole(targetProjectId, "admin");
      if (!authResult.authorized) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden",
            details: authResult.reason || "Only admins and owners can issue team invitations",
          },
          { status: 403, headers: getCorsHeaders() }
        );
      }
    }

    // 4. Generate unique invitation token & expiration
    const token = `inv_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    let invitationId = `rec_${Date.now()}`;

    // Save invitation to team_invitations table
    try {
      const invitePayload = {
        email: cleanEmail,
        role: targetRole,
        token,
        invited_by: user.id,
        project_id: targetProjectId,
        status: "pending",
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };

      const { data: dbData, error: dbError } = await supabaseAdmin
        .from("team_invitations")
        .insert([invitePayload])
        .select()
        .maybeSingle();

      if (dbError) {
        console.warn("[team-invite] team_invitations insert notice:", dbError.message);
      } else if (dbData?.id) {
        invitationId = dbData.id;
      }
    } catch (dbErr: any) {
      console.warn("[team-invite] team_invitations exception:", dbErr?.message || dbErr);
    }

    // 5. Construct invite URL
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = req.headers.get("origin") || `${protocol}://${host}`;
    const inviteLink = `${origin}/accept-invite?token=${token}`;

    // 6. Send invitation email via Resend
    let emailSent = false;
    let emailId: string | undefined;
    let emailError: string | undefined;

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.warn("[team-invite] Warning: RESEND_API_KEY environment variable is missing.");
      emailError = "RESEND_API_KEY is not configured on the server.";
    } else {
      try {
        const resend = new Resend(apiKey);
        const inviterName = user.email ? user.email : "A team member";

        const { data: resendData, error: resendError } = await resend.emails.send({
          from: "Meterix <support@meterix.dev>",
          to: [cleanEmail],
          subject: "You've been invited to join a project on Meterix",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #27272a;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #6366f1; margin: 0; font-size: 24px; font-weight: 700;">Meterix</h1>
                <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Developer AI Metering & Telemetry Platform</p>
              </div>

              <div style="background-color: #18181b; padding: 24px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 24px;">
                <h2 style="color: #f4f4f5; font-size: 18px; margin-top: 0; margin-bottom: 12px;">You're Invited!</h2>
                <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                  <strong>${inviterName}</strong> has invited you to collaborate on Meterix as a <span style="color: #818cf8; font-weight: 600; text-transform: uppercase;">${targetRole}</span>.
                </p>

                <div style="text-align: center; margin: 28px 0;">
                  <a href="${inviteLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-block;">
                    Accept Invitation
                  </a>
                </div>

                <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
                  If the button above does not work, copy and paste this link into your web browser:<br/>
                  <a href="${inviteLink}" style="color: #818cf8; word-break: break-all;">${inviteLink}</a>
                </p>
              </div>

              <div style="text-align: center; font-size: 12px; color: #71717a;">
                This invitation link will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
              </div>
            </div>
          `,
          text: `You've been invited to join a project on Meterix!\n\n${inviterName} has invited you as a ${targetRole.toUpperCase()}.\n\nClick the link below to accept your invitation:\n${inviteLink}\n\nThis link expires in 7 days.`,
        });

        if (resendError) {
          console.error("[team-invite] Resend email send error:", resendError);
          emailError = resendError.message || String(resendError);
        } else if (resendData?.id) {
          emailSent = true;
          emailId = resendData.id;
          console.log(`[team-invite] Team invitation email successfully sent via Resend (ID: ${resendData.id}) to ${cleanEmail}`);
        }
      } catch (e: any) {
        console.error("[team-invite] Unexpected error sending invitation email:", e);
        emailError = e?.message || String(e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Team invitation created successfully",
        invitation: {
          id: invitationId,
          email: cleanEmail,
          role: targetRole,
          token,
          invite_link: inviteLink,
          expires_at: expiresAt,
        },
        email_sent: emailSent,
        ...(emailId && { email_id: emailId }),
        ...(emailError && { email_error: emailError }),
      },
      { status: 201, headers: getCorsHeaders() }
    );
  } catch (err: any) {
    console.error("[team-invite] Unexpected error in team invitation route:", err);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", details: err?.message || String(err) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
