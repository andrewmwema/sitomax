import { z } from "zod";
import type { CuratedFont } from "./fonts";
import { COLOR_PALETTES, THEME_PRESETS, type SiteTheme } from "./presets";

/**
 * Ready-made theme choices that need no AI: one click in the Theme panel, or
 * one short tool call from the AI agent. Each is a plain change to the theme.
 */
export const FONT_PAIRINGS = [
  { id: "elegant", label: "Elegant", heading: "Playfair Display", body: "Lato" },
  { id: "modern", label: "Modern", heading: "Plus Jakarta Sans", body: "Inter" },
  { id: "friendly", label: "Friendly", heading: "Nunito", body: "Nunito" },
  { id: "bold", label: "Bold", heading: "Bebas Neue", body: "Open Sans" },
  { id: "editorial", label: "Editorial", heading: "Lora", body: "Source Sans 3" },
  { id: "warm", label: "Warm", heading: "Fraunces", body: "DM Sans" },
] as const satisfies readonly { id: string; label: string; heading: CuratedFont; body: CuratedFont }[];

export const BUTTON_STYLES = [
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "pill", label: "Pill" },
] as const;

/** Corner rounding for cards, images and (unless a button style says otherwise) buttons. */
export const CORNER_PRESETS = [
  { id: "sharp", label: "Sharp", radius: 0 },
  { id: "subtle", label: "Subtle", radius: 6 },
  { id: "rounded", label: "Rounded", radius: 14 },
  { id: "soft", label: "Soft", radius: 24 },
] as const;

/** Space above and below sections that do not set their own; buildThemeStyle turns it into --section-pad. */
export const SPACING_PRESETS = [
  { id: "compact", label: "Compact", description: "Less space between sections" },
  { id: "comfortable", label: "Comfortable", description: "The style's own spacing" },
  { id: "spacious", label: "Spacious", description: "More room to breathe" },
] as const;
export const SPACING_IDS = ["compact", "comfortable", "spacious"] as const;
export type ThemeSpacing = (typeof SPACING_IDS)[number];

const ids = <T extends readonly { id: string }[]>(items: T) => items.map((item) => item.id) as [T[number]["id"], ...T[number]["id"][]];
export const quickStyleSchema = z.strictObject({
  palette: z.enum(ids(COLOR_PALETTES)).optional(),
  fonts: z.enum(ids(FONT_PAIRINGS)).optional(),
  buttons: z.enum(ids(BUTTON_STYLES)).optional(),
  corners: z.enum(ids(CORNER_PRESETS)).optional(),
  spacing: z.enum(SPACING_IDS).optional(),
});
export type QuickStyle = z.infer<typeof quickStyleSchema>;

/** Applies a curated full theme while retaining site-specific logo assets. */
export function applyThemePreset<T extends SiteTheme>(theme: T, presetId: string): T {
  const preset = THEME_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return theme;
  return {
    ...theme,
    ...preset.theme,
    colors: { ...preset.theme.colors },
  };
}

export function matchesThemePreset(theme: SiteTheme, presetId: string): boolean {
  const preset = THEME_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return false;
  const fields = ["style", "headingFont", "bodyFont", "radius", "buttonStyle", "spacing"] as const;
  return fields.every((field) => theme[field] === preset.theme[field]) &&
    Object.entries(preset.theme.colors ?? {}).every(([key, value]) =>
      theme.colors?.[key as keyof NonNullable<SiteTheme["colors"]>] === value,
    );
}

/** The theme with the chosen presets applied. Everything not named is kept. */
export function applyQuickStyle<T extends SiteTheme>(theme: T, choice: QuickStyle): T {
  const next = { ...theme };
  const palette = COLOR_PALETTES.find((entry) => entry.id === choice.palette);
  if (palette) next.colors = { ...palette.colors };
  const fonts = FONT_PAIRINGS.find((entry) => entry.id === choice.fonts);
  if (fonts) { next.headingFont = fonts.heading; next.bodyFont = fonts.body; }
  if (choice.buttons) next.buttonStyle = choice.buttons;
  const corners = CORNER_PRESETS.find((entry) => entry.id === choice.corners);
  if (corners) next.radius = corners.radius;
  if (choice.spacing) next.spacing = choice.spacing;
  return next;
}

/** One line per kind of preset, naming the choices, for the AI agent's tool description. */
export const QUICK_STYLE_GUIDE = [
  `palette: ${COLOR_PALETTES.map((entry) => `"${entry.id}"`).join(" | ")}`,
  `fonts: ${FONT_PAIRINGS.map((entry) => `"${entry.id}" (${entry.heading}${entry.body === entry.heading ? "" : ` + ${entry.body}`})`).join(" | ")}`,
  `buttons: ${BUTTON_STYLES.map((entry) => `"${entry.id}"`).join(" | ")}`,
  `corners: ${CORNER_PRESETS.map((entry) => `"${entry.id}" (${entry.radius}px)`).join(" | ")}`,
  `spacing between sections: ${SPACING_PRESETS.map((entry) => `"${entry.id}"`).join(" | ")}`,
].join("; ");
