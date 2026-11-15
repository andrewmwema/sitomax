import DOMPurify from "isomorphic-dompurify";

/**
 * Rich text (from Puck's TipTap field) is stored as HTML inside
 * draft_data / published_data. Because clients author it, it MUST be
 * sanitized before it is stored and before it is rendered, so a client
 * can never inject scripts that run for site visitors or for the super
 * admin opening their editor.
 */

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
];

// "style" is allowed but reduced to text-align only (see hook below),
// which is how TipTap persists the alignment toolbar.
const ALLOWED_ATTR = ["href", "target", "rel", "style"];

// Block javascript:, data: and other dangerous URL schemes on links.
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel):|[^a-z0-9+.-]|$)/i;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    // Links always open safely.
    node.setAttribute("rel", "noopener noreferrer");
    if (node.hasAttribute("target")) {
      node.setAttribute("target", "_blank");
    }
  }

  const style = node.getAttribute("style");
  if (style !== null) {
    const match = /text-align:\s*(left|right|center|justify)/i.exec(style);
    if (match) {
      node.setAttribute("style", `text-align: ${match[1].toLowerCase()}`);
    } else {
      node.removeAttribute("style");
    }
  }
});

/** Sanitizes client-authored rich text HTML down to the allowlist. */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Migration shim for values saved before rich text existed: a plain
 * string becomes paragraphs (blank line = new paragraph, newline = br).
 * Already-HTML values pass through unchanged.
 */
export function toRichTextHtml(value: string): string {
  if (/<[a-z][\s\S]*>/i.test(value)) {
    return value;
  }
  return value
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** Plain-text migration + sanitization in one step, for rendering. */
export function renderableRichText(value: string): string {
  return sanitizeRichText(toRichTextHtml(value));
}

type PuckItem = { type?: unknown; props?: Record<string, unknown> };

function sanitizeProp(props: Record<string, unknown>, key: string) {
  if (typeof props[key] === "string") {
    props[key] = renderableRichText(props[key]);
  }
}

function sanitizeArrayProp(props: Record<string, unknown>, key: string, itemKey: string) {
  const list = props[key];
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (entry && typeof entry === "object") {
      sanitizeProp(entry as Record<string, unknown>, itemKey);
    }
  }
}

/**
 * Sanitizes every rich text prop inside a Puck data payload before it is
 * stored. Keep this in sync with the blocks that use richTextField().
 */
export function sanitizePuckData<T extends { content?: unknown }>(data: T): T {
  if (!Array.isArray(data.content)) return data;
  for (const item of data.content as PuckItem[]) {
    const props = item?.props;
    if (!props) continue;
    switch (item.type) {
      case "TextSection":
      case "ImageWithText":
        sanitizeProp(props, "text");
        break;
      case "Services":
        sanitizeArrayProp(props, "services", "text");
        break;
      case "Faq":
        sanitizeArrayProp(props, "items", "answer");
        break;
    }
  }
  return data;
}
