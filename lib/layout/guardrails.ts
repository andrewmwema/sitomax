import { fontFamily, isCuratedFont, CURATED_FONTS, type CuratedFont } from "@/lib/theme/fonts";
import { safeHexColor } from "@/lib/sections/design";

/**
 * Design guardrails for the custom layout system (Section → Row →
 * Column → Element). Clients pick from scales instead of typing raw
 * values, so a page can be rearranged freely without looking broken.
 * Every helper here also re-validates stored values at render time.
 */

/* ------------------------------------------------------------------ */
/* Spacing                                                             */
/* ------------------------------------------------------------------ */

export { SPACING_SCALE, SPACING_OPTIONS, snapSpacing, type SpacingStep } from "./spacing";

/* ------------------------------------------------------------------ */
/* Type scale                                                          */
/* ------------------------------------------------------------------ */

type TypeStep = { label: string; size: string; lineHeight: number; tracking?: string };

/** Large steps are fluid so they never overflow small screens. */
export const TYPE_SCALE = {
  xs: { label: "XS · 12", size: "0.75rem", lineHeight: 1.5 },
  sm: { label: "S · 14", size: "0.875rem", lineHeight: 1.55 },
  base: { label: "M · 16", size: "1rem", lineHeight: 1.6 },
  lg: { label: "L · 18", size: "1.125rem", lineHeight: 1.6 },
  xl: { label: "XL · 20", size: "1.25rem", lineHeight: 1.45 },
  "2xl": { label: "2XL · 24", size: "clamp(1.3rem, 1.15rem + 0.6vw, 1.5rem)", lineHeight: 1.3, tracking: "-0.3px" },
  "3xl": { label: "3XL · 30", size: "clamp(1.5rem, 1.25rem + 1.1vw, 1.875rem)", lineHeight: 1.25, tracking: "-0.5px" },
  "4xl": { label: "4XL · 40", size: "clamp(1.75rem, 1.3rem + 1.9vw, 2.5rem)", lineHeight: 1.18, tracking: "-1px" },
  "5xl": { label: "5XL · 56", size: "clamp(2.25rem, 1.4rem + 3.6vw, 3.5rem)", lineHeight: 1.12, tracking: "-1.5px" },
  "6xl": { label: "6XL · 72", size: "clamp(2.6rem, 1.5rem + 4.8vw, 4.5rem)", lineHeight: 1.05, tracking: "-2px" },
} as const satisfies Record<string, TypeStep>;

export type TypeToken = keyof typeof TYPE_SCALE;
/** A scale token, or a custom size in px (stored as a number). */
export type TypeSize = TypeToken | number;

export const TYPE_TOKENS = Object.keys(TYPE_SCALE) as TypeToken[];
export const CUSTOM_FONT_SIZE_MIN = 10;
export const CUSTOM_FONT_SIZE_MAX = 120;

export function isTypeToken(value: unknown): value is TypeToken {
  return typeof value === "string" && Object.hasOwn(TYPE_SCALE, value);
}

/** CSS for a stored size: scale tokens, or a clamped, fluid custom px value. */
export function typeSizeStyle(
  value: unknown,
  fallback: TypeToken,
): { fontSize: string; lineHeight: number; letterSpacing?: string } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const px = Math.round(
      Math.min(CUSTOM_FONT_SIZE_MAX, Math.max(CUSTOM_FONT_SIZE_MIN, value)),
    );
    const lineHeight = px >= 36 ? 1.12 : px >= 22 ? 1.3 : 1.6;
    // Large custom sizes shrink on small screens (full size at 1280px).
    const fontSize =
      px > 32
        ? `clamp(${Math.round(px * 0.6)}px, ${((px / 1280) * 100).toFixed(2)}vw, ${px}px)`
        : `${px}px`;
    return { fontSize, lineHeight };
  }
  const step: TypeStep = TYPE_SCALE[isTypeToken(value) ? value : fallback];
  return {
    fontSize: step.size,
    lineHeight: step.lineHeight,
    ...(step.tracking ? { letterSpacing: step.tracking } : null),
  };
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

/** Theme heading/body font, or one of the curated Google Fonts. */
export type FontChoice = "heading" | "body" | CuratedFont;

export const FONT_OPTIONS: { label: string; value: FontChoice }[] = [
  { label: "Theme heading font", value: "heading" },
  { label: "Theme body font", value: "body" },
  ...CURATED_FONTS.map((font) => ({
    label: `${font.name} (${font.category})`,
    value: font.name,
  })),
];

export function fontFamilyCss(choice: unknown, fallback: "heading" | "body"): string {
  if (isCuratedFont(choice)) return fontFamily(choice);
  const theme = choice === "heading" || choice === "body" ? choice : fallback;
  return `var(--font-${theme})`;
}

/** The curated font to load for a choice (null for theme fonts). */
export function customFont(choice: unknown): CuratedFont | null {
  return isCuratedFont(choice) ? choice : null;
}

export type FontWeightChoice = "theme" | "regular" | "medium" | "semibold" | "bold";

export const FONT_WEIGHTS: Record<Exclude<FontWeightChoice, "theme">, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Element colors default to the theme palette (stored as tokens, so a
 * theme change restyles every element). "auto" inherits the section's
 * text color, which keeps dark and image sections readable.
 */
export const THEME_COLOR_TOKENS = {
  primary: { label: "Primary", css: "var(--color-primary)" },
  secondary: { label: "Secondary", css: "var(--color-secondary)" },
  text: { label: "Text", css: "var(--color-text)" },
  muted: { label: "Muted text", css: "var(--color-muted)" },
  background: { label: "Background", css: "var(--color-bg)" },
  soft: { label: "Soft background", css: "var(--color-soft-bg)" },
  border: { label: "Border", css: "var(--color-border)" },
} as const;

export type ThemeColorToken = keyof typeof THEME_COLOR_TOKENS;
/** "auto", a theme token, or a custom #hex color. */
export type ColorChoice = "auto" | ThemeColorToken | (string & {});

export function isThemeColorToken(value: unknown): value is ThemeColorToken {
  return typeof value === "string" && Object.hasOwn(THEME_COLOR_TOKENS, value);
}

/** CSS color for a stored choice; undefined means inherit. */
export function colorCss(value: unknown, fallback?: ThemeColorToken): string | undefined {
  if (isThemeColorToken(value)) return THEME_COLOR_TOKENS[value].css;
  const hex = safeHexColor(value);
  if (hex) return hex;
  return fallback ? THEME_COLOR_TOKENS[fallback].css : undefined;
}

/* ------------------------------------------------------------------ */
/* Alignment, links, numbers                                           */
/* ------------------------------------------------------------------ */

export type Align = "left" | "center" | "right";

export function safeAlign(value: unknown, fallback: Align = "left"): Align {
  return value === "left" || value === "center" || value === "right" ? value : fallback;
}

export const JUSTIFY: Record<Align, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/**
 * Client-authored link: http(s), mailto, tel, site-relative paths and
 * #anchors only. javascript:, data: and friends become "#".
 */
export function safeHref(value: unknown): string {
  if (typeof value !== "string") return "#";
  const href = value.trim();
  if (href === "" || href.length > 2000) return "#";
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) {
    return href;
  }
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(href)) return href;
  // Bare domains ("example.com") become https links.
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(href)) {
    return `https://${href}`;
  }
  return "#";
}

/** Picks a value from an allowlist, falling back for anything else. */
export function oneOf<const T extends string | number | boolean>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
