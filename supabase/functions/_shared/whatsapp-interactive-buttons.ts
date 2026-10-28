import type {
  ButtonsMediaRef,
  ButtonsMessageData,
  ButtonsMessageHeader,
  ReplyButton,
} from "./types/message_types.ts";
import type {
  OutgoingCtaUrl,
  OutgoingInteractiveHeader,
  OutgoingReplyButtons,
} from "./types/whatsapp_endpoint_types.ts";
import { markdownToWhatsApp } from "./markdown.ts";

export type OutgoingButtonsInteractive = OutgoingReplyButtons | OutgoingCtaUrl;

function buttonKind(button: ReplyButton): "reply" | "website" {
  return button.type === "website" ? "website" : "reply";
}

function normalizeReplyButton(
  button: ReplyButton,
): { id: string; title: string } {
  if (button.type === "website") {
    throw new Error("Expected reply button");
  }
  return {
    id: button.id?.trim() ?? "",
    title: button.title?.trim() ?? "",
  };
}

function normalizeWebsiteButton(
  button: ReplyButton,
): { title: string; url: string } {
  if (button.type !== "website") {
    throw new Error("Expected website button");
  }
  return {
    title: button.title?.trim() ?? "",
    url: button.url?.trim() ?? "",
  };
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

function mediaRefUri(ref: ButtonsMediaRef): string {
  if ("link" in ref && typeof ref.link === "string") return ref.link.trim();
  if ("id" in ref && typeof ref.id === "string") return ref.id.trim();
  return "";
}

function normalizeMediaRef(
  ref: ButtonsMediaRef,
  kind: "image" | "video" | "document",
): ButtonsMediaRef {
  if ("link" in ref && ref.link != null) {
    const link = String(ref.link).trim();
    if (!link) {
      throw new Error(`Button message ${kind} header requires link or id`);
    }
    return { link };
  }
  if ("id" in ref && ref.id != null) {
    const id = String(ref.id).trim();
    if (!id) {
      throw new Error(`Button message ${kind} header requires link or id`);
    }
    return { id };
  }
  throw new Error(`Button message ${kind} header requires link or id`);
}

/** Normalizes `data.header` into a Cloud API interactive header, or undefined. */
export function buildOutgoingButtonsHeader(
  header: ButtonsMessageHeader | undefined,
): OutgoingInteractiveHeader | undefined {
  if (header == null) return undefined;

  if (typeof header === "string") {
    const text = header.trim();
    if (!text) return undefined;
    if (text.length > 60) {
      throw new Error("Button message header cannot exceed 60 characters");
    }
    return { type: "text", text };
  }

  if (typeof header !== "object" || !("type" in header)) {
    throw new Error(
      "Button message header must be a string or { type: text|image|video|document }",
    );
  }

  switch (header.type) {
    case "text": {
      const text = header.text?.trim() ?? "";
      if (!text) {
        throw new Error("Button message text header requires text");
      }
      if (text.length > 60) {
        throw new Error("Button message header cannot exceed 60 characters");
      }
      return { type: "text", text };
    }
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
    case "document": {
      const document = normalizeMediaRef(header.document, "document");
      const filename = header.document.filename?.trim();
      return {
        type: "document",
        document: filename ? { ...document, filename } : document,
      };
    }
    default:
      throw new Error(
        "Button message header type must be text, image, video, or document",
      );
  }
}

/** True when a buttons header media ref points at OpenBSP internal storage. */
export function isInternalButtonsMediaRef(ref: ButtonsMediaRef): boolean {
  const uri = mediaRefUri(ref);
  return uri.startsWith("internal://media");
}

/** Builds WhatsApp Cloud API interactive payload for `content.kind: "buttons"`. */
export function buildOutgoingButtonsMessage(
  data: ButtonsMessageData,
): OutgoingButtonsInteractive {
  const body = data.body?.trim();
  if (!body) {
    throw new Error("Button message requires body");
  }

  const footer = data.footer?.trim();
  if (footer && footer.length > 60) {
    throw new Error("Button message footer cannot exceed 60 characters");
  }

  const rawButtons = data.buttons ?? [];
  if (rawButtons.length === 0) {
    throw new Error("Button message requires at least one button");
  }

  const kinds = new Set(rawButtons.map(buttonKind));
  if (kinds.size > 1) {
    throw new Error(
      "Button message cannot mix reply and website buttons in one message",
    );
  }

  const bodyText = markdownToWhatsApp(body);
  if (bodyText.length > 1024) {
    throw new Error("Button message body cannot exceed 1024 characters");
  }

  const header = buildOutgoingButtonsHeader(data.header);
  const shared = {
    ...(header ? { header } : {}),
    body: { text: bodyText },
    ...(footer ? { footer: { text: footer } } : {}),
  };

  if (kinds.has("website")) {
    if (rawButtons.length !== 1) {
      throw new Error("Website button message supports exactly one button");
    }
    const { title, url } = normalizeWebsiteButton(rawButtons[0]);
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

  const buttons = rawButtons.map(normalizeReplyButton);
  if (buttons.length < 1 || buttons.length > 3) {
    throw new Error("Reply-button message requires 1–3 buttons");
  }
  if (buttons.some((button) => !button.id || !button.title)) {
    throw new Error("Each reply button requires id and title");
  }
  if (buttons.some((button) => button.title.length > 20)) {
    throw new Error("Reply button title cannot exceed 20 characters");
  }
  if (buttons.some((button) => button.id.length > 256)) {
    throw new Error("Reply button id cannot exceed 256 characters");
  }
  const ids = buttons.map((button) => button.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Reply button ids must be unique");
  }

  return {
    type: "interactive",
    interactive: {
      type: "button",
      ...shared,
      action: {
        buttons: buttons.map((button) => ({
          type: "reply" as const,
          reply: { id: button.id, title: button.title },
        })),
      },
    },
  };
}
