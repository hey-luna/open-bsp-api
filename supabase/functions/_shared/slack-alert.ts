import ky from "ky";
import * as log from "./logger.ts";

/** Incoming webhook URL for ops alerts. Optional — alerts are no-ops if unset. */
export function slackAlertsWebhookUrl(): string | undefined {
  const url = Deno.env.get("SLACK_ALERTS_WEBHOOK_URL")?.trim();
  return url || undefined;
}

/**
 * Luna/OpenBSP request bodies that blow past ~10MB often surface as this parse
 * error on Luna's side. Treat as page-worthy even before max attempts.
 */
export function isLunaBatchJsonPoisonError(error: string): boolean {
  return /Unterminated string in JSON/i.test(error) ||
    /Unexpected end of JSON/i.test(error) ||
    /position 10\d{6}/i.test(error);
}

export type SlackAlertPayload = {
  text: string;
  blocks?: unknown[];
};

/**
 * Best-effort Slack incoming-webhook post. Never throws — alerting must not
 * break the flush/enqueue path.
 */
export async function postSlackAlert(
  payload: SlackAlertPayload,
): Promise<boolean> {
  const url = slackAlertsWebhookUrl();
  if (!url) {
    log.warn("Slack alert skipped: SLACK_ALERTS_WEBHOOK_URL is not set", {
      text: payload.text.slice(0, 200),
    });
    return false;
  }

  try {
    await ky.post(url, {
      json: payload,
      timeout: 5_000,
      throwHttpErrors: true,
    });
    return true;
  } catch (error) {
    log.error("Failed to post Slack alert", {
      error: error instanceof Error ? error.message : String(error),
      text: payload.text.slice(0, 200),
    });
    return false;
  }
}

export function formatLunaBatchFailureAlert(input: {
  batchId: string;
  contactAddress: string;
  organizationId: string;
  errorMessage: string;
  attemptCount: number;
  messageCount: number;
  reason: "max_attempts" | "http_404" | "json_poison" | "flush_error";
}): SlackAlertPayload {
  const title = input.reason === "json_poison"
    ? ":rotating_light: Luna WhatsApp batch JSON poison"
    : ":rotating_light: Luna WhatsApp batch FAILED";

  const text = [
    title,
    `contact=${input.contactAddress}`,
    `batch=${input.batchId}`,
    `org=${input.organizationId}`,
    `messages=${input.messageCount}`,
    `attempts=${input.attemptCount}`,
    `reason=${input.reason}`,
    `error=${input.errorMessage.slice(0, 500)}`,
  ].join("\n");

  return {
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title.replace(":rotating_light: ", ""),
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Contact*\n${input.contactAddress}` },
          { type: "mrkdwn", text: `*Batch*\n\`${input.batchId}\`` },
          { type: "mrkdwn", text: `*Org*\n\`${input.organizationId}\`` },
          {
            type: "mrkdwn",
            text:
              `*Messages / attempts*\n${input.messageCount} / ${input.attemptCount}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reason:* \`${input.reason}\`\n*Error:* ${
            input.errorMessage.slice(0, 500)
          }`,
        },
      },
    ],
  };
}

/** Fire-and-forget wrapper so callers don't await Slack. */
export function alertLunaWhatsAppBatchFailure(
  input: Parameters<typeof formatLunaBatchFailureAlert>[0],
): void {
  const payload = formatLunaBatchFailureAlert(input);
  postSlackAlert(payload).catch(() => {
    // postSlackAlert already logs; swallow to keep fire-and-forget safe
  });
}
