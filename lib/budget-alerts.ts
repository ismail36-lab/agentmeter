import { Resend } from "resend";

export interface SendBudgetAlertInput {
  to: string;
  projectName: string;
  currentSpend: number;
  budgetCap: number;
  actionType?: "warning" | "critical" | "block_new_logs" | "revoke_key" | "alert_only" | string;
  isCritical?: boolean;
}

export interface SendBudgetAlertResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends a budget cap alert email via Resend from Meterix <support@meterix.dev>.
 * Fully asynchronous and safe — never throws unhandled errors.
 */
export async function sendBudgetAlert({
  to,
  projectName,
  currentSpend,
  budgetCap,
  actionType,
  isCritical,
}: SendBudgetAlertInput): Promise<SendBudgetAlertResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[budget-alerts] Missing RESEND_API_KEY environment variable.");
      return { success: false, error: "RESEND_API_KEY is not configured" };
    }

    if (!to || typeof to !== "string" || !to.includes("@")) {
      console.warn("[budget-alerts] Invalid or missing recipient email address:", to);
      return { success: false, error: "Invalid recipient email address" };
    }

    const resend = new Resend(apiKey);
    const safeProjectName = (projectName || "Meterix Project").trim();
    const formattedSpend = `$${Number(currentSpend || 0).toFixed(4)}`;
    const formattedCap = `$${Number(budgetCap || 0).toFixed(2)}`;
    const percentage = budgetCap > 0 ? Math.round((currentSpend / budgetCap) * 100) : 100;

    const isActionTaken =
      Boolean(isCritical) ||
      actionType === "critical" ||
      actionType === "block_new_logs" ||
      actionType === "revoke_key";

    const subject = isActionTaken
      ? `🚨 [Meterix] Action Taken - Budget Exceeded for ${safeProjectName}`
      : `⚠️ [Meterix] Budget Cap Warning - ${safeProjectName}`;

    let actionDescription = "Budget notice logged";
    if (actionType === "revoke_key") {
      actionDescription = "API Key Suspended";
    } else if (actionType === "block_new_logs") {
      actionDescription = "New Log Ingestion Blocked";
    } else if (actionType === "alert_only") {
      actionDescription = "Warning Alert Sent (Ingestion Continuing)";
    }

    const htmlContent = isActionTaken
      ? `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #ef4444;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #ef4444; margin: 0; font-size: 22px; font-weight: 700;">🚨 Budget Exceeded - Action Taken</h1>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Meterix Telemetry Infrastructure</p>
          </div>
          <div style="background-color: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 20px;">
            <h3 style="color: #f4f4f5; margin-top: 0; font-size: 16px;">Target Project: <span style="color: #6366f1;">${safeProjectName}</span></h3>
            <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6;">
              The allocated budget cap for <strong>${safeProjectName}</strong> has been exceeded, and automated enforcement has been applied.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 0; color: #a1a1aa;">Current Spend:</td>
                <td style="padding: 10px 0; color: #ef4444; font-weight: 700; text-align: right;">${formattedSpend} USD (${percentage}%)</td>
              </tr>
              <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 0; color: #a1a1aa;">Budget Limit:</td>
                <td style="padding: 10px 0; color: #f4f4f5; font-weight: 600; text-align: right;">${formattedCap} USD</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #a1a1aa;">Enforced Action:</td>
                <td style="padding: 10px 0; color: #f87171; font-weight: 700; text-align: right;">${actionDescription}</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
            <p style="margin-bottom: 4px;">To resume telemetry ingestion or increase your budget cap, visit your Meterix Dashboard.</p>
            <p style="margin: 0;">Meterix Platform • support@meterix.dev</p>
          </div>
        </div>
      `
      : `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #090d16; color: #f4f4f5; border-radius: 12px; border: 1px solid #f59e0b;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f59e0b; margin: 0; font-size: 22px; font-weight: 700;">⚠️ Budget Cap Warning</h1>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Meterix Telemetry Infrastructure</p>
          </div>
          <div style="background-color: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 20px;">
            <h3 style="color: #f4f4f5; margin-top: 0; font-size: 16px;">Target Project: <span style="color: #6366f1;">${safeProjectName}</span></h3>
            <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6;">
              Your project <strong>${safeProjectName}</strong> has reached <strong>${percentage}%</strong> of its configured budget limit.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 0; color: #a1a1aa;">Current Spend:</td>
                <td style="padding: 10px 0; color: #fbbf24; font-weight: 700; text-align: right;">${formattedSpend} USD</td>
              </tr>
              <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 10px 0; color: #a1a1aa;">Total Budget Limit:</td>
                <td style="padding: 10px 0; color: #f4f4f5; font-weight: 600; text-align: right;">${formattedCap} USD</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #a1a1aa;">Current Level:</td>
                <td style="padding: 10px 0; color: #fbbf24; font-weight: 700; text-align: right;">${percentage}% of cap</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
            <p style="margin-bottom: 4px;">Review and adjust budget limits in your Meterix Dashboard to prevent automatic API key suspension or ingestion blocks.</p>
            <p style="margin: 0;">Meterix Platform • support@meterix.dev</p>
          </div>
        </div>
      `;

    const textContent = isActionTaken
      ? `🚨 [Meterix] Action Taken - Budget Exceeded for ${safeProjectName}\n\nTarget Project: ${safeProjectName}\nCurrent Spend: ${formattedSpend} USD (${percentage}%)\nBudget Limit: ${formattedCap} USD\nEnforced Action: ${actionDescription}\n\nTo resume ingestion or adjust budget limits, visit your Meterix Dashboard.`
      : `⚠️ [Meterix] Budget Cap Warning - ${safeProjectName}\n\nTarget Project: ${safeProjectName}\nCurrent Spend: ${formattedSpend} USD\nTotal Budget Limit: ${formattedCap} USD\nCurrent Level: ${percentage}%\n\nPlease check your Meterix Dashboard to manage your budget cap.`;

    const { data, error } = await resend.emails.send({
      from: "Meterix <support@meterix.dev>",
      to: [to],
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error("[budget-alerts] Resend API error:", error);
      return { success: false, error: error.message || String(error) };
    }

    console.log(`[budget-alerts] Budget alert email sent successfully (ID: ${data?.id}) from support@meterix.dev to ${to}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[budget-alerts] Unexpected error sending budget alert:", err);
    return { success: false, error: err?.message || String(err) };
  }
}
