import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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

// Team-size options that the UI enforces; validated server-side too.
const VALID_TEAM_SIZES = [
  "1-5",
  "6-20",
  "21-50",
  "51-200",
  "201-500",
  "500+",
] as const;
type TeamSize = (typeof VALID_TEAM_SIZES)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Send an internal lead-capture notification.
 * Swap the console log for a Resend / SendGrid call once you add
 * RESEND_API_KEY or SENDGRID_API_KEY to .env.local.
 *
 * Example with Resend:
 * ```ts
 * const resend = new Resend(process.env.RESEND_API_KEY);
 * await resend.emails.send({
 *   from: "leads@meterix.io",
 *   to: "sales@meterix.io",
 *   subject: `New Sales Lead: ${lead.company} (${lead.team_size} people)`,
 *   html: `<pre>${JSON.stringify(lead, null, 2)}</pre>`,
 * });
 * ```
 */
async function notifySalesTeam(lead: LeadBody): Promise<void> {
  // Structured console log acts as an observable event in serverless logs.
  console.info("[leads] New sales enquiry received", {
    timestamp: new Date().toISOString(),
    company: lead.company,
    team_size: lead.team_size,
    contact: `${lead.name} <${lead.email}>`,
    use_case_preview: lead.use_case.slice(0, 120),
  });
}

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Partial<LeadBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validation ────────────────────────────────────────────────────────────
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
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 422 });
  }

  const lead: LeadBody = { name, email, company, team_size: team_size as TeamSize, use_case };

  // ── Duplicate check (same email submitted within 24 h) ────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);

  if ((count ?? 0) > 0) {
    // Return success silently so we don't reveal whether the email is known.
    return NextResponse.json(
      { success: true, message: "Your enquiry has already been received. We'll be in touch soon!" },
      { status: 200 }
    );
  }

  // ── Insert into Supabase leads table ──────────────────────────────────────
  const { data, error: dbError } = await supabaseAdmin
    .from("leads")
    .insert([
      {
        name,
        email,
        company,
        team_size,
        use_case,
        source: "talk_to_sales_modal",
        created_at: new Date().toISOString(),
      },
    ])
    .select("id, created_at")
    .single();

  if (dbError) {
    console.error("[leads] DB insert error:", dbError.message);
    return NextResponse.json(
      { error: "Failed to submit your enquiry. Please try again." },
      { status: 500 }
    );
  }

  // ── Notify sales team ─────────────────────────────────────────────────────
  await notifySalesTeam(lead);

  return NextResponse.json(
    {
      success: true,
      lead_id: data.id,
      message: "Thank you! A member of our sales team will reach out within 1 business day.",
    },
    { status: 201 }
  );
}
