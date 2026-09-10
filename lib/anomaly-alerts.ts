import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

export interface SendAnomalyAlertInput {
  to: string;
  projectName: string;
  model: string;
  estimatedCost: number;
  spikeThresholdUSD?: number;
  timestamp?: string;
  userId?: string | null;
  projectId?: string | null;
  reason?: string;
}

export interface SendAnomalyAlertResult {
  success: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

/**
 * Checks if email notifications are enabled in alert_preferences.
 * Returns true unless email_notifications_enabled is explicitly set to false.
 */
export async function isEmailNotificationEnabled(
  userId?: string | null,
  projectId?: string | null
): Promise<boolean> {
  try {
    if (userId) {
      const { data: userPref } = await supabaseAdmin
        .from("alert_preferences")
        .select("email_notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      if (userPref && userPref.email_notifications_enabled === false) {
        return false;
      }
    }

    if (projectId) {
      const { data: projPref } = await supabaseAdmin
        .from("alert_preferences")
        .select("email_notifications_enabled")
        .eq("project_id", projectId)
        .maybeSingle();

      if (projPref && projPref.email_notifications_enabled === false) {
        return false;
      }
    }
  } catch (err) {
    console.warn("[anomaly-alerts] Notice reading alert_preferences:", err);
  }
  return true;
}

/**
 * Sends a cost spike / anomaly alert email via Resend from 'Meterix <support@meterix.dev>'.
 * Respects email_notifications_enabled from alert_preferences.
 * Fully asynchronous and safe — never throws unhandled errors.
 */
export async function sendAnomalyAlert({
  to,
  projectName,
  model,
  estimatedCost,
  spikeThresholdUSD,
  timestamp,
  userId,
  projectId,
  reason,
}: SendAnomalyAlertInput): Promise<SendAnomalyAlertResult> {
  try {
    // 1. Check alert_preferences for email_notifications_enabled
    const enabled = await isEmailNotificationEnabled(userId, projectId);
    if (!enabled) {
      console.log(`[anomaly-alerts] Skipping email to ${to}: email_notifications_enabled is false in alert_preferences.`);
      return { success: true, skipped: true };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[anomaly-alerts] Missing RESEND_API_KEY environment variable.");
      return { success: false, error: "RESEND_API_KEY is not configured" };
    }

    if (!to || typeof to !== "string" || !to.includes("@")) {
      console.warn("[anomaly-alerts] Invalid or missing recipient email address:", to);
      return { success: false, error: "Invalid recipient email address" };
    }

    const resend = new Resend(apiKey);
    const safeProjectName = (projectName || "Meterix Project").trim();
    const safeModel = (model || "unknown-model").trim();
    const formattedCost = `$${Number(estimatedCost || 0).toFixed(4)}`;
    const formattedThreshold = spikeThresholdUSD !== undefined ? `$${Number(spikeThresholdUSD).toFixed(4)}` : "N/A";
    const alertTime = timestamp || new Date().toISOString();
    const alertReason = reason || "Request cost exceeded threshold / error spike detected";

    const subject = "⚡ [Meterix] Unusual Cost Spike Detected";

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #818cf8;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #818cf8; margin: 0; font-size: 22px; font-weight: 700;">⚡ Unusual Cost Spike Detected</h1>
          <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Meterix Anomaly Monitoring</p>
        </div>

        <div style="background-color: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 20px;">
          <h3 style="color: #f4f4f5; margin-top: 0; font-size: 16px;">Target Project: <span style="color: #6366f1;">${safeProjectName}</span></h3>
          <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6;">
            An unusual cost spike or anomaly was detected in your telemetry request logs.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
            <tr style="border-bottom: 1px solid #27272a;">
              <td style="padding: 10px 0; color: #a1a1aa;">Project Name:</td>
              <td style="padding: 10px 0; color: #f4f4f5; font-weight: 600; text-align: right;">${safeProjectName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #27272a;">
              <td style="padding: 10px 0; color: #a1a1aa;">Timestamp:</td>
              <td style="padding: 10px 0; color: #f4f4f5; font-family: monospace; font-size: 13px; text-align: right;">${alertTime}</td>
            </tr>
            <tr style="border-bottom: 1px solid #27272a;">
              <td style="padding: 10px 0; color: #a1a1aa;">Model Used:</td>
              <td style="padding: 10px 0; color: #818cf8; font-weight: 600; text-align: right;">${safeModel}</td>
            </tr>
            <tr style="border-bottom: 1px solid #27272a;">
              <td style="padding: 10px 0; color: #a1a1aa;">Estimated Cost:</td>
              <td style="padding: 10px 0; color: #fbbf24; font-weight: 700; text-align: right;">${formattedCost} USD</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #a1a1aa;">Threshold Context:</td>
              <td style="padding: 10px 0; color: #a1a1aa; text-align: right;">${formattedThreshold} (Trigger: ${alertReason})</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
          <p style="margin-bottom: 4px;">You are receiving this email because alert notifications are enabled in your <code>alert_preferences</code>.</p>
          <p style="margin: 0;">Meterix Platform • support@meterix.dev</p>
        </div>
      </div>
    `;

    const textContent = `⚡ [Meterix] Unusual Cost Spike Detected\n\nProject Name: ${safeProjectName}\nTimestamp: ${alertTime}\nModel Used: ${safeModel}\nEstimated Cost: ${formattedCost} USD\nSpike Threshold: ${formattedThreshold}\nTrigger Reason: ${alertReason}\n\nView details in your Meterix Dashboard.`;

    const { data, error } = await resend.emails.send({
      from: "Meterix <support@meterix.dev>",
      to: [to],
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error("[anomaly-alerts] Resend API error:", error);
      return { success: false, error: error.message || String(error) };
    }

    console.log(`[anomaly-alerts] Anomaly alert email sent successfully (ID: ${data?.id}) from support@meterix.dev to ${to}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[anomaly-alerts] Unexpected error in sendAnomalyAlert:", err);
    return { success: false, error: err?.message || String(err) };
  }
}
