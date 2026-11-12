import type {
  ButtonsMediaRef,
  CarouselCard,
  CarouselCardHeader,
  CarouselMessageData,
  ReplyButton,
} from "./types/message_types.ts";
import type {
  OutgoingCarousel,
  OutgoingCarouselCard,
  OutgoingCarouselCardHeader,
} from "./types/whatsapp_endpoint_types.ts";
import { markdownToWhatsApp } from "./markdown.ts";

function buttonKind(button: ReplyButton): "reply" | "website" {
  return button.type === "website" ? "website" : "reply";
}

function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Carousel website button url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Carousel website button url must use http or https");
  }
}

function normalizeMediaRef(
  ref: ButtonsMediaRef,
  kind: "image" | "video",
): ButtonsMediaRef {
  if ("link" in ref && ref.link != null) {
    const link = String(ref.link).trim();
    if (!link) {
      throw new Error(`Carousel card ${kind} header requires link or id`);
    }
    return { link };
  }
  if ("id" in ref && ref.id != null) {
    const id = String(ref.id).trim();
    if (!id) {
      throw new Error(`Carousel card ${kind} header requires link or id`);
    }
    return { id };
  }
  throw new Error(`Carousel card ${kind} header requires link or id`);
}

function buildCardHeader(
  header: CarouselCardHeader,
): OutgoingCarouselCardHeader {
  if (typeof header !== "object" || !("type" in header)) {
    throw new Error("Carousel card header must be { type: image|video, ... }");
  }
  switch (header.type) {
    case "image":
      return {
        type: "image",
        image: normalizeMediaRef(header.image, "image"),
      };
    case "video":
      return {
        type: "video",
        video: normalizeMediaRef(header.video, "video"),
      };
    default:
      throw new Error("Carousel card header type must be image or video");
  }
}

function normalizeCardBody(body: string | undefined): string | undefined {
  if (body == null) return undefined;
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  const text = markdownToWhatsApp(trimmed);
  if (text.length > 160) {
    throw new Error("Carousel card body cannot exceed 160 characters");
  }
  const lineBreaks = (text.match(/\n/g) ?? []).length;
  if (lineBreaks > 2) {
    throw new Error("Carousel card body cannot have more than 2 line breaks");
  }
  return text;
}

function buildWebsiteCardAction(
  buttons: ReplyButton[],
): OutgoingCarouselCard["action"] {
  if (buttons.length !== 1) {
    throw new Error(
      "Carousel website cards require exactly one website button",
    );
  }
  const button = buttons[0];
  if (button.type !== "website") {
    throw new Error("Expected website button");
  }
  const title = button.title?.trim() ?? "";
  const url = button.url?.trim() ?? "";
  if (!title || !url) {
    throw new Error("Carousel website button requires title and url");
  }
  if (title.length > 20) {
    throw new Error(
      "Carousel website button title cannot exceed 20 characters",
    );
  }
  if (url.length > 2000) {
    throw new Error(
      "Carousel website button url cannot exceed 2000 characters",
    );
  }
  assertHttpUrl(url);
  return {
    name: "cta_url",
    parameters: {
      display_text: title,
      url,
    },
  };
}

function buildQuickReplyCardAction(
  buttons: ReplyButton[],
): OutgoingCarouselCard["action"] {
  if (buttons.length < 1 || buttons.length > 3) {
    throw new Error("Carousel reply cards require 1–3 reply buttons");
  }
  const replies = buttons.map((button) => {
    if (button.type === "website") {
      throw new Error("Expected reply button");
    }
    return {
      id: button.id?.trim() ?? "",
      title: button.title?.trim() ?? "",
    };
  });
  if (replies.some((button) => !button.id || !button.title)) {
    throw new Error("Each carousel reply button requires id and title");
  }
  if (replies.some((button) => button.title.length > 20)) {
    throw new Error("Carousel reply button title cannot exceed 20 characters");
  }
  if (replies.some((button) => button.id.length > 256)) {
    throw new Error("Carousel reply button id cannot exceed 256 characters");
  }
  const ids = replies.map((button) => button.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Carousel reply button ids must be unique within a card");
  }
  return {
    buttons: replies.map((button) => ({
      type: "quick_reply" as const,
      quick_reply: { id: button.id, title: button.title },
    })),
  };
}

function cardFingerprint(card: CarouselCard): string {
  const buttons = card.buttons ?? [];
  if (buttons.length === 0) {
    throw new Error("Each carousel card requires at least one button");
  }
  const kinds = new Set(buttons.map(buttonKind));
  if (kinds.size !== 1) {
    throw new Error(
      "Carousel card cannot mix reply and website buttons",
    );
  }
  const kind = kinds.has("website") ? "website" : "reply";
  return `${kind}:${buttons.length}`;
}

/** Builds WhatsApp Cloud API interactive payload for `content.kind: "carousel"`. */
export function buildOutgoingCarouselMessage(
  data: CarouselMessageData,
): OutgoingCarousel {
  const body = data.body?.trim();
  if (!body) {
    throw new Error("Carousel message requires body");
  }
  const bodyText = markdownToWhatsApp(body);
  if (bodyText.length > 1024) {
    throw new Error("Carousel message body cannot exceed 1024 characters");
  }

  const cards = data.cards ?? [];
  if (cards.length < 2 || cards.length > 10) {
    throw new Error("Carousel message requires 2–10 cards");
  }

  const fingerprints = cards.map(cardFingerprint);
  if (new Set(fingerprints).size !== 1) {
    throw new Error(
      "Carousel cards must use the same button type and count across all cards",
    );
  }

  const kind = fingerprints[0].startsWith("website:") ? "website" : "reply";

  const outgoingCards: OutgoingCarouselCard[] = cards.map((card, index) => {
    const header = buildCardHeader(card.header);
    const cardBody = normalizeCardBody(card.body);
    const action = kind === "website"
      ? buildWebsiteCardAction(card.buttons)
      : buildQuickReplyCardAction(card.buttons);

    return {
      card_index: index,
      type: "cta_url",
      header,
      ...(cardBody ? { body: { text: cardBody } } : {}),
      action,
    };
  });

  return {
    type: "interactive",
    interactive: {
      type: "carousel",
      body: { text: bodyText },
      action: { cards: outgoingCards },
    },
  };
}
