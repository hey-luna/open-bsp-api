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
  if (payload.interactive.type !== "button") return;
  assertEquals(payload.interactive.action.buttons.length, 2);
  assertEquals(payload.interactive.action.buttons[0].reply.id, "yes");
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

Deno.test("buildOutgoingButtonsMessage: rejects mixed button types", () => {
  assertThrows(
    () =>
      buildOutgoingButtonsMessage({
        body: "Mixed",
        buttons: [
          { id: "a", title: "Reply" },
          { type: "website", title: "Site", url: "https://example.com" },
        ],
      }),
    Error,
    "cannot mix reply and website",
  );
});

Deno.test("buildOutgoingButtonsMessage: website requires single button", () => {
  assertThrows(
    () =>
      buildOutgoingButtonsMessage({
        body: "Two sites",
        buttons: [
          { type: "website", title: "A", url: "https://a.example" },
          { type: "website", title: "B", url: "https://b.example" },
        ],
      }),
    Error,
    "exactly one button",
  );
});

Deno.test("buildOutgoingButtonsMessage: string header stays text", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Body",
    header: "Promo",
    buttons: [{ type: "website", title: "Go", url: "https://example.com" }],
  });
  assertEquals(payload.interactive.header, { type: "text", text: "Promo" });
});

Deno.test("buildOutgoingButtonsMessage: video header object for cta_url", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Watch this",
    header: {
      type: "video",
      video: { link: "https://cdn.example.com/clip.mp4" },
    },
    buttons: [{
      type: "website",
      title: "Learn more",
      url: "https://example.com/promo",
    }],
  });
  assertEquals(payload.interactive.type, "cta_url");
  assertEquals(payload.interactive.header, {
    type: "video",
    video: { link: "https://cdn.example.com/clip.mp4" },
  });
});

Deno.test("buildOutgoingButtonsMessage: image header object for reply buttons", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Choose",
    header: {
      type: "image",
      image: { id: "MEDIA123" },
    },
    buttons: [{ id: "a", title: "A" }],
  });
  assertEquals(payload.interactive.type, "button");
  assertEquals(payload.interactive.header, {
    type: "image",
    image: { id: "MEDIA123" },
  });
});

Deno.test("buildOutgoingButtonsMessage: typed text header object", () => {
  const payload = buildOutgoingButtonsMessage({
    body: "Body",
    header: { type: "text", text: "Headline" },
    buttons: [{ id: "ok", title: "OK" }],
  });
  assertEquals(payload.interactive.header, {
    type: "text",
    text: "Headline",
  });
});

Deno.test("buildOutgoingButtonsMessage: rejects empty media header", () => {
  assertThrows(
    () =>
      buildOutgoingButtonsMessage({
        body: "Body",
        header: { type: "video", video: { link: "  " } },
        buttons: [{
          type: "website",
          title: "Go",
          url: "https://example.com",
        }],
      }),
    Error,
    "requires link or id",
  );
});
