import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildOutgoingCarouselMessage } from "./whatsapp-interactive-carousel.ts";

Deno.test("buildOutgoingCarouselMessage: website cards map to cta_url actions", () => {
  const payload = buildOutgoingCarouselMessage({
    body: "Pick a plant",
    cards: [
      {
        header: {
          type: "image",
          image: { link: "https://example.com/a.jpg" },
        },
        body: "Blue plant",
        buttons: [{
          type: "website",
          title: "Buy",
          url: "https://shop.example.com/a",
        }],
      },
      {
        header: {
          type: "image",
          image: { link: "https://example.com/b.jpg" },
        },
        body: "Green plant",
        buttons: [{
          type: "website",
          title: "Buy",
          url: "https://shop.example.com/b",
        }],
      },
    ],
  });

  assertEquals(payload.interactive.type, "carousel");
  assertEquals(payload.interactive.body.text, "Pick a plant");
  assertEquals(payload.interactive.action.cards.length, 2);
  assertEquals(payload.interactive.action.cards[0].card_index, 0);
  assertEquals(payload.interactive.action.cards[0].type, "cta_url");
  assertEquals(payload.interactive.action.cards[0].action, {
    name: "cta_url",
    parameters: {
      display_text: "Buy",
      url: "https://shop.example.com/a",
    },
  });
});

Deno.test("buildOutgoingCarouselMessage: reply cards map to quick_reply buttons", () => {
  const payload = buildOutgoingCarouselMessage({
    body: "Choose one",
    cards: [
      {
        header: { type: "image", image: { id: "MEDIA1" } },
        buttons: [
          { id: "learn-a", title: "Learn more" },
          { id: "fav-a", title: "Favorite" },
        ],
      },
      {
        header: { type: "video", video: { link: "https://example.com/b.mp4" } },
        buttons: [
          { id: "learn-b", title: "Learn more" },
          { id: "fav-b", title: "Favorite" },
        ],
      },
    ],
  });

  const card0 = payload.interactive.action.cards[0];
  assertEquals(card0.header, { type: "image", image: { id: "MEDIA1" } });
  assertEquals("buttons" in card0.action, true);
  if (!("buttons" in card0.action)) return;
  assertEquals(card0.action.buttons.length, 2);
  assertEquals(card0.action.buttons[0], {
    type: "quick_reply",
    quick_reply: { id: "learn-a", title: "Learn more" },
  });
});

Deno.test("buildOutgoingCarouselMessage: rejects fewer than 2 cards", () => {
  assertThrows(
    () =>
      buildOutgoingCarouselMessage({
        body: "One card",
        cards: [{
          header: {
            type: "image",
            image: { link: "https://example.com/a.jpg" },
          },
          buttons: [{ id: "a", title: "A" }],
        }],
      }),
    Error,
    "2–10 cards",
  );
});

Deno.test("buildOutgoingCarouselMessage: rejects mismatched button shapes", () => {
  assertThrows(
    () =>
      buildOutgoingCarouselMessage({
        body: "Mismatch",
        cards: [
          {
            header: {
              type: "image",
              image: { link: "https://example.com/a.jpg" },
            },
            buttons: [{ id: "a", title: "A" }],
          },
          {
            header: {
              type: "image",
              image: { link: "https://example.com/b.jpg" },
            },
            buttons: [{
              type: "website",
              title: "Buy",
              url: "https://shop.example.com/b",
            }],
          },
        ],
      }),
    Error,
    "same button type and count",
  );
});

Deno.test("buildOutgoingCarouselMessage: rejects oversized card body", () => {
  assertThrows(
    () =>
      buildOutgoingCarouselMessage({
        body: "Ok",
        cards: [
          {
            header: {
              type: "image",
              image: { link: "https://example.com/a.jpg" },
            },
            body: "x".repeat(161),
            buttons: [{ id: "a", title: "A" }],
          },
          {
            header: {
              type: "image",
              image: { link: "https://example.com/b.jpg" },
            },
            buttons: [{ id: "b", title: "B" }],
          },
        ],
      }),
    Error,
    "160 characters",
  );
});
