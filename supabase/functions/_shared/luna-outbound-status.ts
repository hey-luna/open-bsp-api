import ky from "ky";
import * as log from "./logger.ts";
import type { MessageRow, OutgoingStatus } from "./supabase.ts";

export const LUNA_OUTBOUND_STATUS_VALUES = [
  "delivered",
  "failed",
  "read",
] as const;

export type LunaOutboundStatus = (typeof LUNA_OUTBOUND_STATUS_VALUES)[number];

export type LunaOutboundStatusError = {
  code?: number;
  title?: string;
};

export type LunaOutboundStatusPayload = {
  provider_message_id: string;
  wamid?: string;
  status: LunaOutboundStatus;
  timestamp: string;
  errors?: LunaOutboundStatusError[];
  to?: string;
  template_name?: string;
  organization_id: string;
};

const STATUS_PRIORITY: LunaOutboundStatus[] = [
  "failed",
  "read",
  "delivered",
];

export function isLunaOutboundStatus(
  value: string,
): value is LunaOutboundStatus {
  return (LUNA_OUTBOUND_STATUS_VALUES as readonly string[]).includes(value);
}

/** Newly set delivered / failed / read keys vs previous status. */
export function newlySetOutboundStatuses(
  previous: OutgoingStatus | null | undefined,
  next: OutgoingStatus | null | undefined,
): LunaOutboundStatus[] {
  if (!next) return [];
  const out: LunaOutboundStatus[] = [];
  for (const key of LUNA_OUTBOUND_STATUS_VALUES) {
    const was = previous?.[key];
    const now = next[key];
    if (typeof now === "string" && now.length > 0 && was !== now) {
      out.push(key);
    }
  }
  return out;
}

/**
 * One status per notify: prefer failed, then read, then delivered when
 * multiple keys appear in the same merge (unusual, but safe).
 */
export function pickPrimaryOutboundStatus(
  statuses: LunaOutboundStatus[],
): LunaOutboundStatus | null {
  for (const preferred of STATUS_PRIORITY) {
    if (statuses.includes(preferred)) return preferred;
  }
  return null;
}

export function shouldNotifyLunaOutboundStatus(
  message: Pick<MessageRow, "direction" | "service">,
  previous: OutgoingStatus | null | undefined,
  next: OutgoingStatus | null | undefined,
): LunaOutboundStatus | null {
  if (message.direction !== "outgoing") return null;
  if (message.service !== "whatsapp") return null;
  return pickPrimaryOutboundStatus(newlySetOutboundStatuses(previous, next));
}

export function templateNameFromContent(content: unknown): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const c = content as Record<string, unknown>;
  if (c.kind !== "template") return undefined;
  const data = c.data;
  if (!data || typeof data !== "object") return undefined;
  const name = (data as { name?: unknown }).name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

/**
 * Normalize Meta webhook errors and Cloud API / dispatcher error envelopes
 * into `{ code, title }` for Luna.
 */
export function normalizeOutboundStatusErrors(
  errors: unknown,
): LunaOutboundStatusError[] | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;

  const out: LunaOutboundStatusError[] = [];
  for (const entry of errors) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    // WebhookError: { code, title, message, error_data }
    if (typeof e.code === "number" || typeof e.title === "string") {
      out.push({
        ...(typeof e.code === "number" && { code: e.code }),
        ...(typeof e.title === "string" && e.title.length > 0 && {
          title: e.title,
        }),
      });
      continue;
    }

    // Dispatcher / Graph API: { error: { code, error_user_title, message, ... } }
    const nested = e.error;
    if (nested && typeof nested === "object") {
      const err = nested as Record<string, unknown>;
      const code = typeof err.code === "number" ? err.code : undefined;
      const title = typeof err.error_user_title === "string"
        ? err.error_user_title
        : typeof err.message === "string"
        ? err.message
        : typeof err.type === "string"
        ? err.type
        : undefined;
      if (code != null || title) {
        out.push({
          ...(code != null && { code }),
          ...(title && { title }),
        });
      }
    }
  }

  return out.length > 0 ? out : undefined;
}

export function buildLunaOutboundStatusPayload(
  message: MessageRow,
  status: LunaOutboundStatus,
): LunaOutboundStatusPayload {
  const outgoing = message.status as OutgoingStatus;
  const timestamp = outgoing[status] ?? new Date().toISOString();
  const errors = status === "failed"
    ? normalizeOutboundStatusErrors(outgoing.errors)
    : undefined;
  const templateName = templateNameFromContent(message.content);

  return {
    provider_message_id: message.id,
    ...(message.external_id ? { wamid: message.external_id } : {}),
    status,
    timestamp,
    ...(errors && { errors }),
    ...(message.contact_address ? { to: message.contact_address } : {}),
    ...(templateName && { template_name: templateName }),
    organization_id: message.organization_id,
  };
}

export async function sendLunaOutboundStatus(
  payload: LunaOutboundStatusPayload,
): Promise<{ status: number; body: unknown } | null> {
  const url = Deno.env.get("LUNA_OUTBOUND_STATUS_URL");
  const secret = Deno.env.get("LUNA_WEBHOOK_SECRET");
  if (!url || !secret) {
    log.info("Luna outbound status skipped (URL or secret unset)", {
      providerMessageId: payload.provider_message_id,
      status: payload.status,
    });
    return null;
  }

  const response = await ky.post(url, {
    json: payload,
    headers: { Authorization: `Bearer ${secret}` },
    timeout: 15_000,
    throwHttpErrors: false,
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

  return { status: response.status, body };
}
