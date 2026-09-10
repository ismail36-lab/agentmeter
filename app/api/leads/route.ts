import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "react-email";
import { supabaseAdmin } from "@/lib/supabase";
import {
  EnterpriseLeadConfirmationEmail,
  EnterpriseLeadInternalNotificationEmail,
} from "@/emails";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadBody {
  name: string;
  email: string;
  company: string;
  team_size: string;
  use_case: string;
}

const VALID_TEAM_SIZES = [
  "1-5",
  "6-20",
  "21-50",
  "51-200",
  "201-500",
  "500+",
] as const;
type TeamSize = (typeof VALID_TEAM_SIZES)[number];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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

// ---------------------------------------------------------------------------
// Resend Email Helper – renders React Email templates for both emails
// ---------------------------------------------------------------------------

async function sendEnterpriseLeadEmails(lead: LeadBody): Promise<{ internalSent: boolean; userSent: boolean }> {
  let internalSent = false;
  let userSent = false;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[leads] Warning: RESEND_API_KEY is not configured.");
    return { internalSent: false, userSent: false };
  }

  const resend = new Resend(apiKey);
  const fromAddress = "Meterix <support@meterix.dev>";
  const salesEmail =
    process.env.SALES_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    "support@meterix.dev";
  const nowIso = new Date().toISOString();

  // 1. Internal Notification Email to Sales/Admin Team
  try {
    const internalHtml = await render(
      EnterpriseLeadInternalNotificationEmail({
        name: lead.name,
        email: lead.email,
        company: lead.company,
        teamSize: lead.team_size,
        useCase: lead.use_case,
        submittedAt: nowIso,
      })
    );

    const internalText = `🔥 New Enterprise Lead: ${lead.company}\n\nCompany: ${lead.company}\nName: ${lead.name}\nEmail: ${lead.email}\nTeam Size: ${lead.team_size}\nSubmitted: ${nowIso}\n\nUse Case:\n${lead.use_case}`;

    const { data: intData, error: intErr } = await resend.emails.send({
      from: fromAddress,
      to: [salesEmail],
      subject: `🔥 New Enterprise Lead: ${lead.company}`,
      html: internalHtml,
      text: internalText,
    });

    if (intErr) {
      console.error("[leads] Internal sales notification email error:", intErr);
    } else if (intData?.id) {
      internalSent = true;
      console.log(`[leads] Internal lead notification email sent (ID: ${intData.id}) to ${salesEmail}`);
    }
  } catch (err) {
    console.error("[leads] Internal email exception:", err);
  }

  // 2. User Confirmation Email to Lead
  try {
    const userHtml = await render(
      EnterpriseLeadConfirmationEmail({
        name: lead.name,
        company: lead.company,
        email: lead.email,
        teamSize: lead.team_size,
        useCase: lead.use_case,
      })
    );

    const userText = `Thanks for reaching out to Meterix!\n\nHi ${lead.name},\n\nThank you for reaching out to Meterix! We've received your enterprise request for ${lead.company}.\n\nOur team is reviewing your details and will be in touch within 1 business day.\n\nBest regards,\nThe Meterix Team`;

    const { data: userData, error: userErr } = await resend.emails.send({
      from: fromAddress,
      to: [lead.email],
      subject: "Thanks for reaching out to Meterix!",
      html: userHtml,
      text: userText,
    });

    if (userErr) {
      console.error("[leads] User confirmation email error:", userErr);
    } else if (userData?.id) {
      userSent = true;
      console.log(`[leads] User confirmation email sent (ID: ${userData.id}) to ${lead.email}`);
    }
  } catch (err) {
    console.error("[leads] User confirmation email exception:", err);
  }

  return { internalSent, userSent };
}

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: Partial<LeadBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: getCorsHeaders() });
  }

  const errors: string[] = [];
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const company = body.company?.trim() ?? "";
  const team_size = body.team_size?.trim() ?? "";
  const use_case = body.use_case?.trim() ?? "";

  if (!name || name.length < 2) {
    errors.push("name: must be at least 2 characters");
  }
  if (!email || !isValidEmail(email)) {
    errors.push("email: must be a valid email address");
  }
  if (!company || company.length < 2) {
    errors.push("company: must be at least 2 characters");
  }
  if (!team_size || !(VALID_TEAM_SIZES as readonly string[]).includes(team_size)) {
    errors.push(`team_size: must be one of ${VALID_TEAM_SIZES.join(", ")}`);
  }
  if (!use_case || use_case.length < 10) {
    errors.push("use_case: must be at least 10 characters");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 422, headers: getCorsHeaders() });
  }

  const lead: LeadBody = { name, email, company, team_size: team_size as TeamSize, use_case };

  const leadRecord = {
    name,
    email,
    company,
    team_size,
    use_case,
    source: "talk_to_sales_modal",
    created_at: new Date().toISOString(),
  };

  let leadId = `lead_${Date.now()}`;

  // 1. Insert into enterprise_leads table (with fallback to leads table)
  try {
    const { data: entData, error: entErr } = await supabaseAdmin
      .from("enterprise_leads")
      .insert([leadRecord])
      .select("id")
      .maybeSingle();

    if (!entErr && entData?.id) {
      leadId = entData.id;
    } else {
      const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
        .from("leads")
        .insert([leadRecord])
        .select("id")
        .maybeSingle();

      if (!fallbackErr && fallbackData?.id) {
        leadId = fallbackData.id;
      }
    }
  } catch (dbErr: any) {
    console.warn("[leads] DB insertion notice:", dbErr?.message || dbErr);
  }

  // 2. Trigger dual Resend email notifications (React Email templates)
  let emailStatus = { internalSent: false, userSent: false };
  try {
    emailStatus = await sendEnterpriseLeadEmails(lead);
  } catch (emailErr) {
    console.error("[leads] sendEnterpriseLeadEmails exception:", emailErr);
  }

  return NextResponse.json(
    {
      success: true,
      lead_id: leadId,
      email_status: emailStatus,
      message: "Thank you! A member of our sales team will reach out within 1 business day.",
    },
    { status: 201, headers: getCorsHeaders() }
  );
}
