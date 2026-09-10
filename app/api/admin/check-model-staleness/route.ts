import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "react-email";
import { supabaseAdmin } from "@/lib/supabase";
import { StaleModelAlertEmail } from "@/emails/StaleModelAlertEmail";

export const dynamic = "force-dynamic";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

async function handleCheckModelStaleness(req: NextRequest) {
  try {
    // 1. Optional CRON_SECRET authorization check
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (cronSecret && cronSecret !== "your_cron_secret_here" && authHeader) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401, headers: getCorsHeaders() }
        );
      }
    }

    // 2. Query model_pricing for active rows where last_verified_at < 30 days ago or is NULL
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rawData, error: dbError } = await supabaseAdmin
      .from("model_pricing")
      .select("id, model, model_name, provider, input_price_per_million, output_price_per_million, last_verified_at, updated_at, is_active")
      .eq("is_active", true)
      .or(`last_verified_at.lt.${thirtyDaysAgo},last_verified_at.is.null`);

    if (dbError) {
      console.error("[check-model-staleness] Database query error:", dbError.message);
      return NextResponse.json(
        { error: "Database error", details: dbError.message },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    const staleModels = rawData || [];
    const staleCount = staleModels.length;

    console.log(`[check-model-staleness] Found ${staleCount} stale active models needing pricing verification.`);

    let emailSent = false;
    let emailId: string | undefined;
    let emailError: string | undefined;

    // 3. If stale models found, send Resend admin notification using StaleModelAlertEmail template
    if (staleCount > 0) {
      const apiKey = process.env.RESEND_API_KEY;
      const recipient = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || "support@meterix.dev";

      if (!apiKey) {
        console.warn("[check-model-staleness] Warning: RESEND_API_KEY environment variable is missing.");
        emailError = "RESEND_API_KEY is not configured";
      } else {
        try {
          const resend = new Resend(apiKey);

          // Build typed model list for the React Email template
          const templateModels = staleModels.map((m) => ({
            modelName: m.model_name || m.model || "Unknown Model",
            provider: m.provider || "custom",
            inputRate: `$${Number(m.input_price_per_million || 0).toFixed(2)}/1M`,
            outputRate: `$${Number(m.output_price_per_million || 0).toFixed(2)}/1M`,
            lastVerifiedAt: m.last_verified_at
              ? new Date(m.last_verified_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "Never Verified",
          }));

          // Render React Email template to HTML
          const html = await render(
            StaleModelAlertEmail({ staleCount, models: templateModels })
          );

          const textList = staleModels
            .map(
              (m) =>
                `- ${m.model_name || m.model} (${m.provider}): Last verified ${
                  m.last_verified_at ? m.last_verified_at : "Never"
                }`
            )
            .join("\n");

          const textContent = `⚠️ [Meterix Admin] Stale Model Pricing Alert\n\nThe following ${staleCount} model pricing record(s) have not been verified within 30 days:\n\n${textList}\n\nPlease check provider docs and update model_pricing in Supabase.`;

          const { data: resendData, error: resendError } = await resend.emails.send({
            from: "Meterix <support@meterix.dev>",
            to: [recipient],
            subject: "⚠️ [Meterix Admin] Stale Model Pricing Alert",
            html,
            text: textContent,
          });

          if (resendError) {
            console.error("[check-model-staleness] Resend error:", resendError);
            emailError = resendError.message || String(resendError);
          } else if (resendData?.id) {
            emailSent = true;
            emailId = resendData.id;
            console.log(`[check-model-staleness] Admin alert email sent via Resend (ID: ${resendData.id}) to ${recipient}`);
          }
        } catch (e: any) {
          console.error("[check-model-staleness] Resend exception:", e);
          emailError = e?.message || String(e);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        stale_count: staleCount,
        stale_models: staleModels.map((m) => ({
          id: m.id,
          model: m.model,
          model_name: m.model_name || m.model,
          provider: m.provider,
          input_price_per_million: m.input_price_per_million,
          output_price_per_million: m.output_price_per_million,
          last_verified_at: m.last_verified_at,
        })),
        email_sent: emailSent,
        ...(emailId && { email_id: emailId }),
        ...(emailError && { email_error: emailError }),
        message:
          staleCount > 0
            ? `Found ${staleCount} stale model(s). Admin alert email ${emailSent ? "sent successfully" : "failed to send"}.`
            : "All active model pricing records are up to date.",
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (err: any) {
    console.error("[check-model-staleness] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err?.message || String(err) },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCheckModelStaleness(req);
}

export async function POST(req: NextRequest) {
  return handleCheckModelStaleness(req);
}
