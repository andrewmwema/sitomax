import type { CSSProperties, ReactNode } from "react";
import { googleFontsUrl } from "@/lib/theme/fonts";
import {
  FONT_WEIGHTS,
  colorCss,
  customFont,
  fontFamilyCss,
  safeAlign,
  typeSizeStyle,
  type FontWeightChoice,
  type ThemeColorToken,
  type TypeToken,
} from "@/lib/layout/guardrails";

/**
 * Shared rendering helpers for layout-system elements. Everything is
 * derived from validated choices (scale tokens, curated fonts, theme
 * colors) — never raw CSS.
 */

/** Loads a curated Google Font that isn't one of the theme fonts. */
export function FontLink({ choice }: { choice: unknown }) {
  const font = customFont(choice);
  return font ? <link rel="stylesheet" href={googleFontsUrl([font])} /> : null;
}

export function fontWeightCss(
  weight: unknown,
  fallback: number | "theme",
): CSSProperties["fontWeight"] {
  const choice = weight as FontWeightChoice;
  if (choice !== "theme" && choice in FONT_WEIGHTS) {
    return FONT_WEIGHTS[choice as keyof typeof FONT_WEIGHTS];
  }
  const theme = choice === "theme" ? "theme" : fallback;
  return theme === "theme"
    ? ("var(--heading-weight)" as CSSProperties["fontWeight"])
    : theme;
}

export function textStyle({
  size,
  sizeFallback,
  font,
  fontFallback,
  color,
  colorFallback,
  align,
}: {
  size: unknown;
  sizeFallback: TypeToken;
  font?: unknown;
  fontFallback?: "heading" | "body";
  color?: unknown;
  colorFallback?: ThemeColorToken;
  align?: unknown;
}): CSSProperties {
  return {
    ...typeSizeStyle(size, sizeFallback),
    ...(fontFallback ? { fontFamily: fontFamilyCss(font, fontFallback) } : null),
    color: colorCss(color, colorFallback),
    textAlign: align === undefined ? undefined : safeAlign(align),
  };
}

/** Empty-state box shown in the editor (and nowhere else). */
export function ElementPlaceholder({
  children,
  height = 160,
}: {
  children: ReactNode;
  height?: number;
}) {
  return (
    <div
      className="flex w-full items-center justify-center px-4 text-center text-sm"
      style={{
        minHeight: height,
        backgroundColor: "var(--color-soft-bg)",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-muted)",
      }}
    >
      {children}
    </div>
  );
}

export const RADIUS = {
  none: "0px",
  theme: "var(--radius-sm)",
  large: "var(--radius-lg)",
  round: "9999px",
} as const;

export type RadiusChoice = keyof typeof RADIUS;

export const WIDTH_OPTIONS = [
  { label: "Full", value: "100" },
  { label: "3/4", value: "75" },
  { label: "1/2", value: "50" },
  { label: "1/4", value: "25" },
];
