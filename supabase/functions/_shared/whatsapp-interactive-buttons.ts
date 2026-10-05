import type { ButtonsMessageData, ReplyButton } from "./types/message_types.ts";
import type {
  OutgoingCtaUrl,
  OutgoingInteractiveButton,
  OutgoingReplyButtons,
} from "./types/whatsapp_endpoint_types.ts";
import { markdownToWhatsApp } from "./markdown.ts";

export type OutgoingButtonsInteractive = OutgoingReplyButtons | OutgoingCtaUrl;

const MAX_BUTTONS = 10;
const MAX_WEBSITE_BUTTONS = 2;
const MAX_REPLY_ONLY_BUTTONS = 3;

function buttonKind(button: ReplyButton): "reply" | "website" {
  return button.type === "website" ? "website" : "reply";
}

function normalizeReplyButton(
  button: ReplyButton,
): { id: string; title: string } {
  if (button.type === "website") {
    throw new Error("Expected reply button");
  }
  const id = button.id?.trim() ?? "";
  const title = button.title?.trim() ?? "";
  if (!id || !title) {
    throw new Error("Each reply button requires id and title");
  }
  if (title.length > 20) {
    throw new Error("Reply button title cannot exceed 20 characters");
  }
  if (id.length > 256) {
    throw new Error("Reply button id cannot exceed 256 characters");
  }
  return { id, title };
}

function normalizeWebsiteButton(
  button: ReplyButton,
): { title: string; url: string } {
  if (button.type !== "website") {
    throw new Error("Expected website button");
  }
  const title = button.title?.trim() ?? "";
  const url = button.url?.trim() ?? "";
  if (!title || !url) {
    throw new Error("Website button requires title and url");
  }
  if (title.length > 20) {
    throw new Error("Website button title cannot exceed 20 characters");
  }
  if (url.length > 2000) {
    throw new Error("Website button url cannot exceed 2000 characters");
  }
  assertHttpUrl(url);
  return { title, url };
}

function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Website button url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Website button url must use http or https");
  }
}

function toOutgoingButton(button: ReplyButton): OutgoingInteractiveButton {
  if (buttonKind(button) === "website") {
    const { title, url } = normalizeWebsiteButton(button);
    return { type: "url", url: { display_text: title, url } };
  }
  const { id, title } = normalizeReplyButton(button);
  return { type: "reply", reply: { id, title } };
}

/** Builds WhatsApp Cloud API interactive payload for `content.kind: "buttons"`. */
export function buildOutgoingButtonsMessage(
  data: ButtonsMessageData,
): OutgoingButtonsInteractive {
  const body = data.body?.trim();
  if (!body) {
    throw new Error("Button message requires body");
  }

  const header = data.header?.trim();
  const footer = data.footer?.trim();
  if (header && header.length > 60) {
    throw new Error("Button message header cannot exceed 60 characters");
  }
  if (footer && footer.length > 60) {
    throw new Error("Button message footer cannot exceed 60 characters");
  }

  const rawButtons = data.buttons ?? [];
  if (rawButtons.length === 0) {
    throw new Error("Button message requires at least one button");
  }
  if (rawButtons.length > MAX_BUTTONS) {
    throw new Error("Button message supports at most 10 buttons");
  }

  const websiteButtons = rawButtons.filter((button) =>
    buttonKind(button) === "website"
  );
  const replyButtons = rawButtons.filter((button) =>
    buttonKind(button) === "reply"
  );
  if (websiteButtons.length > MAX_WEBSITE_BUTTONS) {
    throw new Error("Button message supports at most 2 website buttons");
  }

  const replyIds = replyButtons.map((button) =>
    normalizeReplyButton(button).id
  );
  if (new Set(replyIds).size !== replyIds.length) {
    throw new Error("Reply button ids must be unique");
  }

  const bodyText = markdownToWhatsApp(body);
  if (bodyText.length > 1024) {
    throw new Error("Button message body cannot exceed 1024 characters");
  }

  const shared = {
    ...(header ? { header: { type: "text" as const, text: header } } : {}),
    body: { text: bodyText },
    ...(footer ? { footer: { text: footer } } : {}),
  };

  if (websiteButtons.length === 1 && replyButtons.length === 0) {
    const { title, url } = normalizeWebsiteButton(websiteButtons[0]);
    return {
      type: "interactive",
      interactive: {
        type: "cta_url",
        ...shared,
        action: {
          name: "cta_url",
          parameters: {
            display_text: title,
            url,
          },
        },
      },
    };
  }

  if (websiteButtons.length === 0) {
    if (
      replyButtons.length < 1 ||
      replyButtons.length > MAX_REPLY_ONLY_BUTTONS
    ) {
      throw new Error("Reply-button message requires 1–3 buttons");
    }
  }

  // Meta lists CTA URL buttons before reply buttons in mixed messages.
  const ordered = [...websiteButtons, ...replyButtons];

  return {
    type: "interactive",
    interactive: {
      type: "button",
      ...shared,
      action: {
        buttons: ordered.map(toOutgoingButton),
      },
    },
  };
}
