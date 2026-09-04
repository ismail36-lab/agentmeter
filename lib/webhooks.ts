import { supabaseAdmin } from "@/lib/supabase";

export interface WebhookConfig {
  id: string;
  user_id: string;
  name: string;
  url: string;
  type: "slack" | "discord";
  triggers: string[];
  is_active: boolean;
  created_at: string;
}

export interface WebhookEventPayload {
  event: "budget_alert" | "budget_exceeded" | "test_webhook";
  apiKeyName: string;
  currentSpend: number;
  budgetCap: number;
  userId?: string | null;
  message?: string;
}

/** Formatter for Slack Block Kit message payload */
export function formatSlackBlockKitPayload(payload: WebhookEventPayload): object {
  const isExceeded = payload.event === "budget_exceeded";
  const titleEmoji = isExceeded ? "🚨" : "⚠️";
  const titleText = isExceeded
    ? "Meterix Alert: Budget Exceeded"
    : payload.event === "test_webhook"
    ? "Meterix Webhook Test Notification"
    : "Meterix Warning: Budget Threshold Approaching";

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${titleEmoji} ${titleText}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*API Key / Target:*\n\`${payload.apiKeyName}\``,
          },
          {
            type: "mrkdwn",
            text: `*Event Trigger:*\n\`${payload.event}\``,
          },
          {
            type: "mrkdwn",
            text: `*Current Spend:*\n*$${payload.currentSpend.toFixed(4)} USD*`,
          },
          {
            type: "mrkdwn",
            text: `*Budget Cap:*\n*$${payload.budgetCap.toFixed(2)} USD*`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Meterix Telemetry Engine • ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };
}

/** Formatter for Discord Embeds payload */
export function formatDiscordEmbedPayload(payload: WebhookEventPayload): object {
  const isExceeded = payload.event === "budget_exceeded";
  const embedColor = isExceeded ? 15158332 : payload.event === "test_webhook" ? 3447003 : 16753920; // Red vs Blue vs Amber
  const title = isExceeded
    ? "🚨 Meterix Alert: Budget Exceeded"
    : payload.event === "test_webhook"
    ? "🧪 Meterix Webhook Test Notification"
    : "⚠️ Meterix Warning: Budget Threshold Approaching";

  return {
    embeds: [
      {
        title,
        color: embedColor,
        fields: [
          { name: "API Key Name", value: `\`${payload.apiKeyName}\``, inline: true },
          { name: "Event", value: `\`${payload.event}\``, inline: true },
          { name: "Current Spend", value: `**$${payload.currentSpend.toFixed(4)} USD**`, inline: true },
          { name: "Budget Cap", value: `**$${payload.budgetCap.toFixed(2)} USD**`, inline: true },
        ],
        footer: {
          text: "Meterix Telemetry Infrastructure",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Dispatch webhook alert to all active webhooks for a given user or event.
 * Never throws errors — catches all failure modes silently.
 */
export async function dispatchWebhookAlert(payload: WebhookEventPayload): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;

  try {
    // 1. Fetch active webhooks from DB
    let query = supabaseAdmin.from("webhook_configs").select("*").eq("is_active", true);

    if (payload.userId) {
      query = query.or(`user_id.eq.${payload.userId},user_id.is.null`);
    }

    const { data: configs, error } = await query;
    if (error || !configs || configs.length === 0) {
      return { dispatched: 0, failed: 0 };
    }

    // 2. Filter webhooks configured for this trigger event
    const activeWebhooks: WebhookConfig[] = configs.filter((cfg: any) => {
      if (payload.event === "test_webhook") return true;
      const triggers: string[] = Array.isArray(cfg.triggers) ? cfg.triggers : [];
      return triggers.includes(payload.event);
    });

    // 3. Dispatch HTTP POST requests concurrently
    await Promise.allSettled(
      activeWebhooks.map(async (cfg) => {
        try {
          const bodyPayload =
            cfg.type === "discord"
              ? formatDiscordEmbedPayload(payload)
              : formatSlackBlockKitPayload(payload);

          const res = await fetch(cfg.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });

          if (res.ok) {
            dispatched += 1;
          } else {
            failed += 1;
            console.warn(`Webhook dispatch to ${cfg.name} (${cfg.type}) failed with status ${res.status}`);
          }
        } catch (err) {
          failed += 1;
          console.warn(`Error dispatching webhook to ${cfg.url}:`, err);
        }
      })
    );
  } catch (err) {
    console.warn("Error in dispatchWebhookAlert:", err);
  }

  return { dispatched, failed };
}
