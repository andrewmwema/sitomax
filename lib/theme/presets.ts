import type { CSSProperties } from "react";

/**
 * Shared design foundation for every Puck block.
 *
 * sites.theme stores the client's choices:
 *   { style: "classic" | "modern", colors: {...}, logoUrl }
 *
 * A style preset decides typography and shape (fonts, radii, shadows,
 * spacing); the color palette stays independent. Everything is exposed
 * as CSS variables that blocks and the ui/ primitives consume — blocks
 * never hard-code colors, fonts, radii or spacing.
 */

export type StyleId = "classic" | "modern";

export type SiteTheme = {
  style?: StyleId;
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  logoUrl?: string;
};

export const DEFAULT_COLORS = {
  primary: "#1e3a5f",
  secondary: "#b08d57",
  background: "#ffffff",
  text: "#1c2b3a",
} as const;

export const STYLE_PRESETS: Record<
  StyleId,
  { label: string; description: string; vars: Record<string, string> }
> = {
  classic: {
    label: "Classic",
    description: "Serif display headings, crisp corners, editorial feel.",
    vars: {
      "--font-heading": "var(--font-dm-serif), Georgia, serif",
      "--font-body": "var(--font-inter), system-ui, sans-serif",
      "--heading-weight": "400",
      "--radius-sm": "4px",
      "--radius-lg": "6px",
      "--shadow-card": "0 1px 2px rgba(15, 23, 42, 0.06)",
      "--section-pad": "clamp(64px, 8vw, 104px)",
      "--container": "1200px",
    },
  },
  modern: {
    label: "Modern",
    description: "Bold geometric headings, large radii, soft shadows.",
    vars: {
      "--font-heading": "var(--font-jakarta), system-ui, sans-serif",
      "--font-body": "var(--font-inter), system-ui, sans-serif",
      "--heading-weight": "800",
      "--radius-sm": "16px",
      "--radius-lg": "24px",
      "--shadow-card":
        "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -12px rgba(15, 23, 42, 0.14)",
      "--section-pad": "clamp(64px, 8vw, 112px)",
      "--container": "1200px",
    },
  },
};

/** Curated palettes offered in the theme panel. */
export const COLOR_PALETTES = [
  {
    id: "navy-brass",
    label: "Navy & brass",
    colors: { primary: "#1e3a5f", secondary: "#b08d57", background: "#ffffff", text: "#1c2b3a" },
  },
  {
    id: "ocean-blue",
    label: "Ocean blue",
    colors: { primary: "#0369a1", secondary: "#0d9488", background: "#ffffff", text: "#0f172a" },
  },
  {
    id: "forest-green",
    label: "Forest green",
    colors: { primary: "#1d6a43", secondary: "#b98a2f", background: "#fdfdf9", text: "#1a2e22" },
  },
  {
    id: "charcoal-gold",
    label: "Charcoal & gold",
    colors: { primary: "#2b2b2b", secondary: "#c09a3e", background: "#ffffff", text: "#211e1b" },
  },
  {
    id: "plum",
    label: "Plum",
    colors: { primary: "#6d2857", secondary: "#a8784f", background: "#fffbfd", text: "#331627" },
  },
] as const;

/** WCAG relative luminance of a #rrggbb / #rgb color. */
function relativeLuminance(hex: string): number {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const DARK_INK = "#17202b";

/** White or dark ink for text on the primary color — WCAG 4.5:1 first. */
export function onPrimaryColor(primary: string): string {
  try {
    return contrastRatio("#ffffff", primary) >= 4.5 ? "#ffffff" : DARK_INK;
  } catch {
    return "#ffffff";
  }
}

/** Mix two hex colors (JS equivalent of color-mix for computed vars). */
function mixHex(a: string, b: string, weightA: number): string {
  const parse = (hex: string) => {
    let v = hex.replace("#", "");
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16));
  };
  const [ca, cb] = [parse(a), parse(b)];
  return `#${ca
    .map((ch, i) =>
      Math.round(ch * weightA + cb[i] * (1 - weightA))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Call-to-action color on a dark or photo background: the accent when
 * it stands out at WCAG 4.5:1, otherwise white. Used by Section
 * (dark/primary) and SectionShell (light text over photos/video) so
 * primary buttons stay visible on every dark surface.
 */
export function ctaOnColor(background: string, accent: string): string {
  try {
    return contrastRatio(accent, background) >= 4.5 ? accent : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/**
 * All theme CSS variables for a site: palette colors, computed tints and
 * the chosen style preset. Applied once on the Puck page root.
 */
export function buildThemeStyle(theme: SiteTheme | null | undefined): CSSProperties {
  const colors = { ...DEFAULT_COLORS, ...theme?.colors };
  const preset = STYLE_PRESETS[theme?.style ?? "classic"] ?? STYLE_PRESETS.classic;

  // Computed in JS (not color-mix) so button contrast can be measured.
  const darkBg = mixHex(colors.text, "#000000", 0.92);
  const ctaDark = ctaOnColor(darkBg, colors.secondary);
  const ctaPrimary = ctaOnColor(colors.primary, colors.secondary);

  return {
    "--color-primary": colors.primary,
    "--color-secondary": colors.secondary,
    "--color-bg": colors.background,
    "--color-text": colors.text,
    "--color-on-primary": onPrimaryColor(colors.primary),
    // Computed tints keep every palette harmonious without extra choices.
    "--color-muted": "color-mix(in srgb, var(--color-text) 64%, var(--color-bg))",
    "--color-soft-bg": "color-mix(in srgb, var(--color-primary) 6%, var(--color-bg))",
    "--color-border": "color-mix(in srgb, var(--color-text) 14%, transparent)",
    "--color-dark-bg": darkBg,
    // Primary-button colors on dark and primary backgrounds.
    "--color-cta-dark": ctaDark,
    "--color-on-cta-dark": onPrimaryColor(ctaDark),
    "--color-cta-primary": ctaPrimary,
    "--color-on-cta-primary": onPrimaryColor(ctaPrimary),
    ...preset.vars,
  } as CSSProperties;
}
