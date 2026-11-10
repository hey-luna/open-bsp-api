import { assertEquals } from "jsr:@std/assert@1";
import {
  buildLunaOutboundStatusPayload,
  newlySetOutboundStatuses,
  normalizeOutboundStatusErrors,
  pickPrimaryOutboundStatus,
  shouldNotifyLunaOutboundStatus,
  templateNameFromContent,
} from "./luna-outbound-status.ts";
import type { MessageRow, OutgoingStatus } from "./supabase.ts";

function outgoingMessage(
  overrides: Partial<MessageRow> & { status?: OutgoingStatus } = {},
): MessageRow {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: "org-1",
    organization_address: "123",
    contact_address: "972501234567",
    conversation_id: "conv-1",
    group_address: null,
    thread_id: null,
    service: "whatsapp" as const,
    direction: "outgoing" as const,
    external_id: "wamid.ABC",
    timestamp: "2026-11-10T08:00:00Z",
    created_at: "2026-11-10T08:00:00Z",
    updated_at: "2026-11-10T08:00:00Z",
    agent_id: null,
    webhook_index: null,
    content: {
      version: "1" as const,
      type: "data" as const,
      kind: "template" as const,
      data: {
        name: "order_update",
        language: { code: "en", policy: "deterministic" as const },
      },
    },
    status: {
      sent: "2026-11-10T08:00:01Z",
    },
  };
  return { ...base, ...overrides } as MessageRow;
}

Deno.test("newlySetOutboundStatuses detects failed", () => {
  assertEquals(
    newlySetOutboundStatuses(
      { sent: "2026-11-10T08:00:01Z" },
      {
        sent: "2026-11-10T08:00:01Z",
        failed: "2026-11-10T08:00:05Z",
        errors: [{ code: 131049, title: "Spam" }],
      } as OutgoingStatus,
    ),
    ["failed"],
  );
});

Deno.test("newlySetOutboundStatuses ignores unchanged keys", () => {
  assertEquals(
    newlySetOutboundStatuses(
      { delivered: "2026-11-10T08:00:02Z" },
      { delivered: "2026-11-10T08:00:02Z" },
    ),
    [],
  );
});

Deno.test("pickPrimaryOutboundStatus prefers failed", () => {
  assertEquals(
    pickPrimaryOutboundStatus(["delivered", "failed", "read"]),
    "failed",
  );
});

Deno.test("shouldNotifyLunaOutboundStatus ignores incoming", () => {
  assertEquals(
    shouldNotifyLunaOutboundStatus(
      { direction: "incoming", service: "whatsapp" },
      {},
      { failed: "2026-11-10T08:00:05Z" },
    ),
    null,
  );
});

Deno.test("shouldNotifyLunaOutboundStatus ignores non-whatsapp", () => {
  assertEquals(
    shouldNotifyLunaOutboundStatus(
      { direction: "outgoing", service: "instagram" },
      {},
      { failed: "2026-11-10T08:00:05Z" },
    ),
    null,
  );
});

Deno.test("templateNameFromContent reads template data.name", () => {
  assertEquals(
    templateNameFromContent({
      kind: "template",
      data: { name: "order_update" },
    }),
    "order_update",
  );
  assertEquals(
    templateNameFromContent({ kind: "text", text: "hi" }),
    undefined,
  );
});

Deno.test("normalizeOutboundStatusErrors handles webhook + graph shapes", () => {
  assertEquals(
    normalizeOutboundStatusErrors([
      { code: 131049, title: "This message was not delivered" },
      {
        error: {
          code: 132001,
          error_user_title: "Template paused",
          message: "Template unavailable",
        },
      },
    ]),
    [
      { code: 131049, title: "This message was not delivered" },
      { code: 132001, title: "Template paused" },
    ],
  );
});

Deno.test("buildLunaOutboundStatusPayload maps fields for Luna", () => {
  const payload = buildLunaOutboundStatusPayload(
    outgoingMessage({
      status: {
        sent: "2026-11-10T08:00:01Z",
        failed: "2026-11-10T08:00:05Z",
        errors: [{
          code: 131049,
          title: "Spam Rate Limit Hit",
          message: "blocked",
          error_data: { details: "spam" },
          href: "https://example.com",
        }],
      },
    }),
    "failed",
  );

  assertEquals(payload, {
    provider_message_id: "11111111-1111-1111-1111-111111111111",
    wamid: "wamid.ABC",
    status: "failed",
    timestamp: "2026-11-10T08:00:05Z",
    errors: [{ code: 131049, title: "Spam Rate Limit Hit" }],
    to: "972501234567",
    template_name: "order_update",
    organization_id: "org-1",
  });
});
