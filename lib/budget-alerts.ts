import { Resend } from "resend";
import { render } from "react-email";
import { BudgetAlertEmail } from "@/emails/BudgetAlertEmail";

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
 * Uses React Email for rendering (BudgetAlertEmail template).
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
    const percentage = budgetCap > 0 ? Math.round((currentSpend / budgetCap) * 100) : 100;

    const isActionTaken =
      Boolean(isCritical) ||
      actionType === "critical" ||
      actionType === "block_new_logs" ||
      actionType === "revoke_key";

    let actionDescription = "Budget notice logged";
    if (actionType === "revoke_key") {
      actionDescription = "API Key Suspended";
    } else if (actionType === "block_new_logs") {
      actionDescription = "New Log Ingestion Blocked";
    } else if (actionType === "alert_only") {
      actionDescription = "Warning Alert Sent (Ingestion Continuing)";
    }

    const subject = isActionTaken
      ? `🚨 [Meterix] Action Taken - Budget Exceeded for ${safeProjectName}`
      : `⚠️ [Meterix] Budget Cap Warning - ${safeProjectName}`;

    // Render React Email template to HTML string
    const html = await render(
      BudgetAlertEmail({
        projectName: safeProjectName,
        currentSpend,
        budgetCap,
        percentage,
        actionType,
        actionDescription,
        isCritical: isActionTaken,
      })
    );

    const formattedSpend = `$${Number(currentSpend || 0).toFixed(4)}`;
    const formattedCap = `$${Number(budgetCap || 0).toFixed(2)}`;

    const textContent = isActionTaken
      ? `🚨 [Meterix] Action Taken - Budget Exceeded for ${safeProjectName}\n\nTarget Project: ${safeProjectName}\nCurrent Spend: ${formattedSpend} USD (${percentage}%)\nBudget Limit: ${formattedCap} USD\nEnforced Action: ${actionDescription}\n\nTo resume ingestion or adjust budget limits, visit your Meterix Dashboard.`
      : `⚠️ [Meterix] Budget Cap Warning - ${safeProjectName}\n\nTarget Project: ${safeProjectName}\nCurrent Spend: ${formattedSpend} USD\nTotal Budget Limit: ${formattedCap} USD\nCurrent Level: ${percentage}%\n\nPlease check your Meterix Dashboard to manage your budget cap.`;

    const { data, error } = await resend.emails.send({
      from: "Meterix <support@meterix.dev>",
      to: [to],
      subject,
      html,
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
