import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildOutgoingButtonsMessage } from "./whatsapp-interactive-buttons.ts";

Deno.test("buildOutgoingButtonsMessage: reply buttons unchanged", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Pick one",
    buttons: [
      { id: "yes", title: "Yes" },
      { id: "no", title: "No" },
    ],
  });
  assertEquals(payload.interactive.type, "button");
  assertEquals(
    "category" in payload ? payload.category : undefined,
    undefined,
  );
  if (payload.interactive.type !== "button") return;
  assertEquals(payload.interactive.action.buttons.length, 2);
  const first = payload.interactive.action.buttons[0];
  assertEquals(first.type, "reply");
  if (first.type !== "reply") return;
  assertEquals(first.reply.id, "yes");
});

Deno.test("buildOutgoingButtonsMessage: website button maps to cta_url", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Visit our site",
    buttons: [{
      type: "website",
      title: "Open site",
      url: "https://example.com/path",
    }],
  });
  assertEquals(payload.interactive.type, "cta_url");
  assertEquals(
    "category" in payload ? payload.category : undefined,
    undefined,
  );
  if (payload.interactive.type !== "cta_url") return;
  assertEquals(payload.interactive.action.name, "cta_url");
  assertEquals(
    payload.interactive.action.parameters.display_text,
    "Open site",
  );
  assertEquals(
    payload.interactive.action.parameters.url,
    "https://example.com/path",
  );
});

Deno.test("buildOutgoingButtonsMessage: mixed buttons use Direct Send", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Mixed",
    buttons: [
      { id: "a", title: "Reply" },
      { type: "website", title: "Site", url: "https://example.com" },
    ],
  });
  assertEquals(payload.interactive.type, "button");
  if (payload.interactive.type !== "button") return;
  assertEquals(
    "category" in payload ? payload.category : undefined,
    "utility",
  );
  const buttons = payload.interactive.action.buttons;
  assertEquals(buttons.map((button) => button.type), ["cta_url", "reply"]);
  const urlButton = buttons[0];
  const replyButton = buttons[1];
  assertEquals(urlButton.type, "cta_url");
  if (urlButton.type !== "cta_url") return;
  assertEquals(urlButton.cta_url.display_text, "Site");
  assertEquals(urlButton.cta_url.url, "https://example.com");
  assertEquals(replyButton.type, "reply");
  if (replyButton.type !== "reply") return;
  assertEquals(replyButton.reply.id, "a");
});

Deno.test("buildOutgoingButtonsMessage: two website buttons use Direct Send", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Two sites",
    buttons: [
      { type: "website", title: "A", url: "https://a.example" },
      { type: "website", title: "B", url: "https://b.example" },
    ],
  });
  assertEquals(payload.interactive.type, "button");
  if (payload.interactive.type !== "button") return;
  assertEquals(
    "category" in payload ? payload.category : undefined,
    "utility",
  );
  assertEquals(
    payload.interactive.action.buttons.map((button) => button.type),
    ["cta_url", "cta_url"],
  );
});

Deno.test("buildOutgoingButtonsMessage: 4 reply buttons use Direct Send", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "More replies",
    buttons: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
    ],
  });
  assertEquals(payload.interactive.type, "button");
  if (payload.interactive.type !== "button") return;
  assertEquals(
    "category" in payload ? payload.category : undefined,
    "utility",
  );
  assertEquals(payload.interactive.action.buttons.length, 4);
});

Deno.test("buildOutgoingButtonsMessage: rejects more than two website buttons", () => {
  assertThrows(
    () =>
      buildOutgoingButtonsMessage({
        body: "Three sites",
        buttons: [
          { type: "website", title: "A", url: "https://a.example" },
          { type: "website", title: "B", url: "https://b.example" },
          { type: "website", title: "C", url: "https://c.example" },
        ],
      }),
    Error,
    "at most 2 website buttons",
  );
});

Deno.test("buildOutgoingButtonsMessage: rejects more than 10 buttons", () => {
  assertThrows(
    () =>
      buildOutgoingButtonsMessage({
        body: "Too many",
        buttons: Array.from({ length: 11 }, (_, i) => ({
          id: `b${i}`,
          title: `B${i}`,
        })),
      }),
    Error,
    "at most 10 buttons",
  );
});
