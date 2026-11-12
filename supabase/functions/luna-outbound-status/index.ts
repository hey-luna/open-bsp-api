import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as log from "../_shared/logger.ts";
import {
  buildLunaOutboundStatusPayload,
  lunaOutboundStatusConfigured,
  sendLunaOutboundStatus,
  shouldNotifyLunaOutboundStatus,
} from "../_shared/luna-outbound-status.ts";
import type {
  MessageRow,
  OutgoingStatus,
  WebhookPayload,
} from "../_shared/supabase.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== SERVICE_ROLE_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Cheap exit before JSON work when Luna callback is not wired.
  const config = lunaOutboundStatusConfigured();
  if (!config) {
    return new Response("Skipped", { status: 200 });
  }

  let body: WebhookPayload<MessageRow>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const message = body.record;
  if (!message) {
    return new Response("Ignored", { status: 200 });
  }

  const previous = body.old_record?.status as OutgoingStatus | undefined;
  const next = message.status as OutgoingStatus;
  const status = shouldNotifyLunaOutboundStatus(message, previous, next);
  if (!status) {
    return new Response("Ignored", { status: 200 });
  }

  const payload = buildLunaOutboundStatusPayload(message, status);

  try {
    const result = await sendLunaOutboundStatus(payload, config);

    if (result.status >= 400) {
      log.error("Luna outbound status callback failed", {
        httpStatus: result.status,
        providerMessageId: payload.provider_message_id,
        status: payload.status,
        body: result.body,
      });
      // 200 so pg_net / trigger path does not hammer retries on Luna outages.
      return new Response("Upstream error", { status: 200 });
    }

    log.info("Luna outbound status notified", {
      providerMessageId: payload.provider_message_id,
      wamid: payload.wamid,
      status: payload.status,
      httpStatus: result.status,
    });
    return new Response("OK", { status: 200 });
  } catch (error) {
    log.error("Luna outbound status callback threw", {
      providerMessageId: payload.provider_message_id,
      status: payload.status,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Upstream error", { status: 200 });
  }
});
