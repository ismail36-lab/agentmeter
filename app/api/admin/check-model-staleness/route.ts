import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

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

    // 3. If stale models found, send Resend admin notification
    if (staleCount > 0) {
      const apiKey = process.env.RESEND_API_KEY;
      const recipient = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || "support@meterix.dev";

      if (!apiKey) {
        console.warn("[check-model-staleness] Warning: RESEND_API_KEY environment variable is missing.");
        emailError = "RESEND_API_KEY is not configured";
      } else {
        try {
          const resend = new Resend(apiKey);

          // Build HTML list / table of stale models
          const tableRowsHtml = staleModels
            .map((m) => {
              const name = m.model_name || m.model || "Unknown Model";
              const provider = m.provider || "custom";
              const verifiedAt = m.last_verified_at
                ? new Date(m.last_verified_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "Never Verified";
              const inRate = `$${Number(m.input_price_per_million || 0).toFixed(2)}/1M`;
              const outRate = `$${Number(m.output_price_per_million || 0).toFixed(2)}/1M`;

              return `
                <tr style="border-bottom: 1px solid #27272a;">
                  <td style="padding: 10px; color: #f4f4f5; font-weight: 600;">${name}</td>
                  <td style="padding: 10px; color: #a1a1aa;">${provider}</td>
                  <td style="padding: 10px; color: #818cf8; font-family: monospace;">${inRate} / ${outRate}</td>
                  <td style="padding: 10px; color: #ef4444; font-weight: 500;">${verifiedAt}</td>
                </tr>
              `;
            })
            .join("");

          const textList = staleModels
            .map(
              (m) =>
                `- ${m.model_name || m.model} (${m.provider}): Last verified ${
                  m.last_verified_at ? m.last_verified_at : "Never"
                }`
            )
            .join("\n");

          const htmlContent = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #f59e0b;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 700;">⚠️ Stale Model Pricing Alert</h1>
                <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Meterix Automated Admin Verification System</p>
              </div>

              <div style="background-color: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 20px;">
                <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin-top: 0;">
                  The following <strong>${staleCount}</strong> active model pricing record(s) have not been verified within the last 30 days and require manual verification:
                </p>

                <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; text-align: left;">
                  <thead>
                    <tr style="border-bottom: 1px solid #3f3f46; color: #a1a1aa;">
                      <th style="padding: 8px 10px;">Model Name</th>
                      <th style="padding: 8px 10px;">Provider</th>
                      <th style="padding: 8px 10px;">Current Rate (In/Out)</th>
                      <th style="padding: 8px 10px;">Last Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRowsHtml}
                  </tbody>
                </table>
              </div>

              <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
                <p style="margin-bottom: 4px;">Please review provider documentation and update the <code>model_pricing</code> table in Supabase.</p>
                <p style="margin: 0;">Meterix Engine • support@meterix.dev</p>
              </div>
            </div>
          `;

          const textContent = `⚠️ [Meterix Admin] Stale Model Pricing Alert\n\nThe following ${staleCount} model pricing record(s) have not been verified within 30 days:\n\n${textList}\n\nPlease check provider docs and update model_pricing in Supabase.`;

          const { data: resendData, error: resendError } = await resend.emails.send({
            from: "Meterix <support@meterix.dev>",
            to: [recipient],
            subject: "⚠️ [Meterix Admin] Stale Model Pricing Alert",
            html: htmlContent,
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
