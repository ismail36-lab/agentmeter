import { Resend } from "resend";
import { render } from "react-email";
import { supabaseAdmin } from "@/lib/supabase";
import { AnomalyAlertEmail } from "@/emails/AnomalyAlertEmail";

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
 * Uses React Email for rendering (AnomalyAlertEmail template).
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
    const alertTime = timestamp || new Date().toISOString();
    const alertReason = reason || "Request cost exceeded threshold / error spike detected";
    const formattedCost = `$${Number(estimatedCost || 0).toFixed(4)}`;
    const formattedThreshold =
      spikeThresholdUSD !== undefined ? `$${Number(spikeThresholdUSD).toFixed(4)}` : "N/A";

    const subject = "⚡ [Meterix] Unusual Cost Spike Detected";

    // Render React Email template to HTML string
    const html = await render(
      AnomalyAlertEmail({
        projectName: safeProjectName,
        model: safeModel,
        estimatedCost,
        spikeThresholdUSD,
        timestamp: alertTime,
        reason: alertReason,
      })
    );

    const textContent = `⚡ [Meterix] Unusual Cost Spike Detected\n\nProject Name: ${safeProjectName}\nTimestamp: ${alertTime}\nModel Used: ${safeModel}\nEstimated Cost: ${formattedCost} USD\nSpike Threshold: ${formattedThreshold}\nTrigger Reason: ${alertReason}\n\nView details in your Meterix Dashboard.`;

    const { data, error } = await resend.emails.send({
      from: "Meterix <support@meterix.dev>",
      to: [to],
      subject,
      html,
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
