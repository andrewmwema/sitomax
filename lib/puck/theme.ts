import type { CSSProperties } from "react";

/**
 * Site-wide theme stored in sites.theme as JSON and applied everywhere
 * (editor preview + public renderer) as CSS variables. Blocks must read
 * colors and fonts from these variables, never hard-coded colors.
 */

export type SiteTheme = {
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  logoUrl?: string;
};

export const THEME_DEFAULTS = {
  colors: {
    primary: "#4f46e5",
    secondary: "#0ea5e9",
    background: "#ffffff",
    text: "#18181b",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
  },
} as const;

/** Short Google Fonts list offered in the theme panel. */
export const GOOGLE_FONTS = [
  { name: "Inter", fallback: "sans-serif" },
  { name: "Poppins", fallback: "sans-serif" },
  { name: "Montserrat", fallback: "sans-serif" },
  { name: "Roboto", fallback: "sans-serif" },
  { name: "Open Sans", fallback: "sans-serif" },
  { name: "Playfair Display", fallback: "serif" },
  { name: "Lora", fallback: "serif" },
  { name: "Merriweather", fallback: "serif" },
] as const;

export type GoogleFontName = (typeof GOOGLE_FONTS)[number]["name"];

function fontStack(name: string | undefined, fallbackName: string): string {
  const font = GOOGLE_FONTS.find((f) => f.name === name);
  const chosen = font ?? GOOGLE_FONTS.find((f) => f.name === fallbackName)!;
  return `'${chosen.name}', ${chosen.fallback}`;
}

/** Maps a site theme to the CSS variables blocks rely on. */
export function themeToCssVars(theme: SiteTheme | null | undefined): CSSProperties {
  const t = theme ?? {};
  return {
    "--color-primary": t.colors?.primary ?? THEME_DEFAULTS.colors.primary,
    "--color-secondary": t.colors?.secondary ?? THEME_DEFAULTS.colors.secondary,
    "--color-background": t.colors?.background ?? THEME_DEFAULTS.colors.background,
    "--color-text": t.colors?.text ?? THEME_DEFAULTS.colors.text,
    "--font-heading": fontStack(t.fonts?.heading, THEME_DEFAULTS.fonts.heading),
    "--font-body": fontStack(t.fonts?.body, THEME_DEFAULTS.fonts.body),
  } as CSSProperties;
}

/** Google Fonts stylesheet URL for the theme's heading + body fonts. */
export function googleFontsUrl(theme: SiteTheme | null | undefined): string {
  const names = [
    ...new Set([
      theme?.fonts?.heading ?? THEME_DEFAULTS.fonts.heading,
      theme?.fonts?.body ?? THEME_DEFAULTS.fonts.body,
    ]),
  ].filter((name) => GOOGLE_FONTS.some((f) => f.name === name));

  const families = names
    .map((name) => `family=${name.replaceAll(" ", "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
