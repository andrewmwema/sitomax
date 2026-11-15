import DOMPurify from "isomorphic-dompurify";
import type { Field } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import { CURATED_FONT_NAMES } from "@/lib/theme/fonts";

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
  "s",
  "a",
  "span",
  "mark",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
];

// "style" is allowed but reduced to a strict allowlist of properties and
// value shapes (see the hook below) for the text toolbar (Phase 4c).
const ALLOWED_ATTR = ["href", "target", "rel", "style"];

// Block javascript:, data: and other dangerous URL schemes on links.
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel):|[^a-z0-9+.-]|$)/i;

const HEX_COLOR_REGEXP = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// rgb()/rgba() with plain numbers only — no var(), calc(), url(), etc.
const RGB_COLOR_REGEXP =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+|1\.0+)\s*)?\)$/i;

function normalizeColor(value: string): string | null {
  return HEX_COLOR_REGEXP.test(value) || RGB_COLOR_REGEXP.test(value)
    ? value.toLowerCase()
    : null;
}

/** Only fonts from the curated platform list (lib/theme/fonts.ts). */
function normalizeFontFamily(value: string): string | null {
  const name = value.trim().replace(/^["']+|["']+$/g, "").trim();
  const match = CURATED_FONT_NAMES.find(
    (font) => font.toLowerCase() === name.toLowerCase(),
  );
  if (!match) return null;
  return /\s/.test(match) ? `"${match}"` : match;
}

/** px or rem, between 10px and 96px (1rem = 16px). */
function normalizeFontSize(value: string): string | null {
  const match = /^(\d+(?:\.\d+)?)(px|rem)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const px = unit === "px" ? amount : amount * 16;
  if (px < 10 || px > 96) return null;
  return `${amount}${unit}`;
}

function normalizeTextAlign(value: string): string | null {
  const align = value.trim().toLowerCase();
  return ["left", "right", "center", "justify"].includes(align) ? align : null;
}

/** Unitless number between 1 and 3. */
function normalizeLineHeight(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const amount = Number(value);
  return amount >= 1 && amount <= 3 ? String(amount) : null;
}

/**
 * The only inline style properties client HTML may carry. Each validator
 * returns the normalized value, or null to drop the declaration.
 */
const STYLE_VALIDATORS: Record<string, (value: string) => string | null> = {
  "color": normalizeColor,
  "background-color": normalizeColor,
  "font-family": normalizeFontFamily,
  "font-size": normalizeFontSize,
  "text-align": normalizeTextAlign,
  "line-height": normalizeLineHeight,
};

function sanitizeStyleAttribute(style: string): string | null {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const validate = STYLE_VALIDATORS[property];
    if (!validate) continue;
    const value = validate(declaration.slice(separator + 1).trim());
    if (value !== null) kept.push(`${property}: ${value}`);
  }
  return kept.length > 0 ? kept.join("; ") : null;
}

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
    const clean = sanitizeStyleAttribute(style);
    if (clean !== null) {
      node.setAttribute("style", clean);
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

type PuckFields = Record<string, Field>;

/** The parts of a Puck config the sanitizer walks. */
export type SanitizableConfig = {
  root?: { fields?: PuckFields };
  components?: Record<string, { fields?: PuckFields } | undefined>;
};

/**
 * Sanitizes every prop whose field is declared as "richtext", recursing
 * through array fields, object fields and slot fields at any depth.
 */
function sanitizeFields(
  props: unknown,
  fields: PuckFields | undefined,
  config: SanitizableConfig,
): void {
  if (!props || typeof props !== "object" || Array.isArray(props) || !fields) {
    return;
  }
  const record = props as Record<string, unknown>;
  for (const [key, field] of Object.entries(fields)) {
    if (!field) continue;
    const value = record[key];
    switch (field.type) {
      case "richtext":
        if (typeof value === "string") {
          record[key] = renderableRichText(value);
        }
        break;
      case "array":
        if (Array.isArray(value)) {
          for (const entry of value) {
            sanitizeFields(entry, field.arrayFields as PuckFields, config);
          }
        }
        break;
      case "object":
        sanitizeFields(value, field.objectFields as PuckFields, config);
        break;
      case "slot":
        sanitizeContent(value, config);
        break;
    }
  }
}

/** Sanitizes one component item ({ type, props }) using its config fields. */
function sanitizeItem(item: unknown, config: SanitizableConfig): void {
  if (!item || typeof item !== "object") return;
  const { type, props } = item as { type?: unknown; props?: unknown };
  if (typeof type !== "string") return;
  sanitizeFields(props, config.components?.[type]?.fields, config);
}

function sanitizeContent(content: unknown, config: SanitizableConfig): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    sanitizeItem(item, config);
  }
}

/**
 * Sanitizes every rich text prop inside a Puck data payload before it is
 * stored. Walks the whole tree — root.props, content, zones, and slot /
 * array / object fields at any depth — driven by the field definitions
 * in the Puck config, so new blocks are covered automatically.
 */
export function sanitizePuckData<T extends object>(
  data: T,
  config: SanitizableConfig = puckConfig as SanitizableConfig,
): T {
  const payload = data as {
    root?: { props?: unknown };
    content?: unknown;
    zones?: unknown;
  };
  sanitizeFields(payload.root?.props, config.root?.fields, config);
  sanitizeContent(payload.content, config);
  if (payload.zones && typeof payload.zones === "object") {
    for (const zone of Object.values(payload.zones)) {
      sanitizeContent(zone, config);
    }
  }
  return data;
}
