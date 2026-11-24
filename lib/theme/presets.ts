import type { CSSProperties } from "react";
import { fontFamily, isCuratedFont, type CuratedFont } from "./fonts";
import {
  bestContrastingTextColor,
  contrastRatio,
  nearestContrast,
} from "./contrast";

export { assessContrast, bestContrastingTextColor, contrastRatio, contrastWarning,
  nearestContrast, resolveContrastBackgrounds, reviewContrast, WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT } from "./contrast";

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

export type MobileStickyCtaSettings = {
  enabled: boolean;
  label: string;
  href: string;
};

export type SiteTheme = {
  style?: StyleId;
  headingFont?: CuratedFont;
  bodyFont?: CuratedFont;
  radius?: number;
  buttonStyle?: "rounded" | "square" | "pill";
  spacing?: "compact" | "comfortable" | "spacious";
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  logoUrl?: string;
  logoAlt?: string;
  faviconUrl?: string;
  mobileStickyCta?: MobileStickyCtaSettings;
};

export type CuratedThemePreset = {
  id: string;
  label: string;
  description: string;
  theme: SiteTheme;
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
      "--font-heading": '"DM Serif Display", Georgia, serif',
      "--font-body": '"Inter", system-ui, sans-serif',
      "--heading-weight": "400",
      "--radius-sm": "4px",
      "--radius-lg": "6px",
      "--shadow-card": "0 1px 2px rgba(15, 23, 42, 0.06)",
      "--section-pad": "clamp(64px, 8vw, 104px)",
      "--container": "1200px",
      "--container-narrow": "720px",
      "--container-wide": "1440px",
      "--type-xs": "0.75rem",
      "--type-sm": "0.875rem",
      "--type-base": "1rem",
      "--type-lg": "1.125rem",
      "--type-xl": "1.25rem",
      "--type-2xl": "clamp(1.5rem, 1.2rem + 1.2vw, 2rem)",
      "--type-3xl": "clamp(1.875rem, 1.4rem + 2vw, 2.75rem)",
      "--type-display": "clamp(2.5rem, 1.4rem + 4.5vw, 4.5rem)",
      "--line-height-body": "1.7",
      "--line-height-heading": "1.08",
      "--tracking-display": "-0.04em",
      "--space-1": "0.25rem",
      "--space-2": "0.5rem",
      "--space-3": "0.75rem",
      "--space-4": "1rem",
      "--space-6": "1.5rem",
      "--space-8": "2rem",
      "--space-12": "3rem",
      "--section-pad-compact": "clamp(40px, 5vw, 64px)",
      "--section-pad-normal": "clamp(64px, 8vw, 104px)",
      "--section-pad-spacious": "clamp(88px, 11vw, 152px)",
      "--shadow-soft": "0 1px 2px rgba(15, 23, 42, 0.05), 0 12px 32px -18px rgba(15, 23, 42, 0.2)",
      "--shadow-medium": "0 4px 12px rgba(15, 23, 42, 0.08), 0 20px 48px -20px rgba(15, 23, 42, 0.24)",
      "--motion-duration": "200ms",
      "--motion-ease": "cubic-bezier(0.2, 0.7, 0.2, 1)",
    },
  },
  modern: {
    label: "Modern",
    description: "Bold geometric headings, large radii, soft shadows.",
    vars: {
      "--font-heading": '"Plus Jakarta Sans", system-ui, sans-serif',
      "--font-body": '"Inter", system-ui, sans-serif',
      "--heading-weight": "800",
      "--radius-sm": "16px",
      "--radius-lg": "24px",
      "--shadow-card":
        "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -12px rgba(15, 23, 42, 0.14)",
      "--section-pad": "clamp(64px, 8vw, 112px)",
      "--container": "1200px",
      "--container-narrow": "720px",
      "--container-wide": "1440px",
      "--type-xs": "0.75rem",
      "--type-sm": "0.875rem",
      "--type-base": "1rem",
      "--type-lg": "1.125rem",
      "--type-xl": "1.25rem",
      "--type-2xl": "clamp(1.5rem, 1.2rem + 1.2vw, 2rem)",
      "--type-3xl": "clamp(1.875rem, 1.4rem + 2vw, 2.75rem)",
      "--type-display": "clamp(2.5rem, 1.4rem + 4.5vw, 4.5rem)",
      "--line-height-body": "1.7",
      "--line-height-heading": "1.08",
      "--tracking-display": "-0.04em",
      "--space-1": "0.25rem",
      "--space-2": "0.5rem",
      "--space-3": "0.75rem",
      "--space-4": "1rem",
      "--space-6": "1.5rem",
      "--space-8": "2rem",
      "--space-12": "3rem",
      "--section-pad-compact": "clamp(40px, 5vw, 64px)",
      "--section-pad-normal": "clamp(64px, 8vw, 112px)",
      "--section-pad-spacious": "clamp(88px, 11vw, 152px)",
      "--shadow-soft": "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.18)",
      "--shadow-medium": "0 4px 12px rgba(15, 23, 42, 0.08), 0 20px 48px -20px rgba(15, 23, 42, 0.24)",
      "--motion-duration": "200ms",
      "--motion-ease": "cubic-bezier(0.2, 0.7, 0.2, 1)",
    },
  },
};

export function themeFonts(theme: SiteTheme | null | undefined): [CuratedFont, CuratedFont] {
  return [
    isCuratedFont(theme?.headingFont)
      ? theme.headingFont
      : theme?.style === "modern" ? "Plus Jakarta Sans" : "DM Serif Display",
    isCuratedFont(theme?.bodyFont) ? theme.bodyFont : "Inter",
  ];
}

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

/** Complete, tested combinations for a one-click visual direction. */
export const THEME_PRESETS: readonly CuratedThemePreset[] = [
  {
    id: "modern-navy",
    label: "Modern Navy",
    description: "Confident navy, warm brass and clean geometric type.",
    theme: {
      style: "modern",
      headingFont: "Plus Jakarta Sans",
      bodyFont: "Inter",
      radius: 16,
      buttonStyle: "rounded",
      spacing: "comfortable",
      colors: { primary: "#17324f", secondary: "#bd9656", accent: "#bd9656", background: "#f7f9fc", text: "#19283a" },
    },
  },
  {
    id: "warm-editorial",
    label: "Warm Editorial",
    description: "Soft paper, terracotta accents and expressive serif headings.",
    theme: {
      style: "classic",
      headingFont: "Fraunces",
      bodyFont: "Lato",
      radius: 8,
      buttonStyle: "rounded",
      spacing: "spacious",
      colors: { primary: "#8e4338", secondary: "#a96f4e", accent: "#b65a3c", background: "#fcf8f2", text: "#352923" },
    },
  },
  {
    id: "bold-mono",
    label: "Bold Mono",
    description: "High-contrast black and white with a sharp lime accent.",
    theme: {
      style: "modern",
      headingFont: "Archivo Black",
      bodyFont: "Inter",
      radius: 0,
      buttonStyle: "square",
      spacing: "compact",
      colors: { primary: "#171717", secondary: "#525252", accent: "#d9f36a", background: "#ffffff", text: "#171717" },
    },
  },
  {
    id: "fresh-green",
    label: "Fresh Green",
    description: "Grounded green, botanical neutrals and approachable sans type.",
    theme: {
      style: "modern",
      headingFont: "Manrope",
      bodyFont: "Inter",
      radius: 14,
      buttonStyle: "rounded",
      spacing: "comfortable",
      colors: { primary: "#1d6245", secondary: "#98752e", accent: "#98752e", background: "#f5faf6", text: "#19372a" },
    },
  },
  {
    id: "luxury-black-gold",
    label: "Luxury Black & Gold",
    description: "Restrained charcoal, warm gold and refined serif typography.",
    theme: {
      style: "classic",
      headingFont: "Cormorant Garamond",
      bodyFont: "Lato",
      radius: 4,
      buttonStyle: "square",
      spacing: "spacious",
      colors: { primary: "#292520", secondary: "#a9853e", accent: "#a9853e", background: "#fbf9f4", text: "#24211c" },
    },
  },
  {
    id: "soft-neutral",
    label: "Soft Neutral",
    description: "Quiet lavender, warm gray and open, balanced spacing.",
    theme: {
      style: "classic",
      headingFont: "Lora",
      bodyFont: "Source Sans 3",
      radius: 14,
      buttonStyle: "pill",
      spacing: "comfortable",
      colors: { primary: "#555477", secondary: "#80685c", accent: "#80685c", background: "#faf9f6", text: "#2b2a34" },
    },
  },
] as const;

/** Section spacing presets; "comfortable" keeps the style preset's own. */
const SECTION_PAD: Record<string, string | undefined> = {
  compact: "clamp(40px, 5vw, 64px)",
  spacious: "clamp(88px, 11vw, 152px)",
};

const DARK_INK = "#17202b";

/** White or dark ink for text on the primary color — WCAG 4.5:1 first. */
export function onPrimaryColor(primary: string): string {
  return bestContrastingTextColor([primary], ["#ffffff", DARK_INK, "#000000"]) ?? "#000000";
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
    return contrastRatio(accent, background) >= 4.5
      ? accent
      : bestContrastingTextColor([background], ["#ffffff", "#000000"]) ?? "#ffffff";
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
  const softBg = mixHex(colors.primary, colors.background, 0.06);
  const ctaDark = ctaOnColor(darkBg, colors.accent ?? colors.secondary);
  const ctaPrimary = ctaOnColor(colors.primary, colors.accent ?? colors.secondary);
  const ctaBackground = ctaOnColor(colors.background, colors.primary);
  const onSoftBg = onPrimaryColor(softBg);
  const onBackground = nearestContrast(colors.text, [colors.background]) ?? onPrimaryColor(colors.background);
  const [headingFont, bodyFont] = themeFonts(theme);
  const radius = typeof theme?.radius === "number" && Number.isFinite(theme.radius) ? Math.min(48, Math.max(0, theme.radius)) : undefined;
  const buttonRadius = theme?.buttonStyle === "square" ? "0px" : theme?.buttonStyle === "pill" ? "999px"
    : theme?.buttonStyle === "rounded" ? (radius === undefined ? "12px" : `${radius}px`) : "var(--radius-sm)";

  return {
    "--color-primary": colors.primary,
    "--color-secondary": colors.secondary,
    "--color-accent": colors.accent ?? colors.secondary,
    "--color-bg": colors.background,
    "--color-surface": colors.background,
    "--color-surface-alt": "var(--color-soft-bg)",
    "--color-surface-dark": darkBg,
    "--color-text": onBackground,
    "--color-on-bg": onBackground,
    "--color-on-soft-bg": onSoftBg,
    "--color-on-dark-bg": onPrimaryColor(darkBg),
    "--color-on-primary": onPrimaryColor(colors.primary),
    // Computed tints keep every palette harmonious without extra choices.
    "--color-muted": onBackground,
    "--color-soft-bg": "color-mix(in srgb, var(--color-primary) 6%, var(--color-bg))",
    "--color-surface-soft": "var(--color-soft-bg)",
    "--color-border": "color-mix(in srgb, var(--color-text) 14%, transparent)",
    "--color-focus": colors.primary,
    "--color-neutral-0": "#ffffff",
    "--color-neutral-50": "#f8fafc",
    "--color-neutral-100": "#f1f5f9",
    "--color-neutral-200": "#e2e8f0",
    "--color-neutral-500": "#64748b",
    "--color-neutral-700": "#334155",
    "--color-neutral-900": "#0f172a",
    "--btn-primary-bg": "var(--color-primary)",
    "--btn-primary-fg": "var(--color-on-primary)",
    "--btn-secondary-bg": "transparent",
    "--btn-secondary-fg": "var(--color-text)",
    "--btn-secondary-border": "currentColor",
    "--btn-ghost-bg": "transparent",
    "--btn-ghost-fg": "var(--color-text)",
    "--btn-hover-opacity": "0.9",
    "--color-dark-bg": darkBg,
    "--color-cta-background": ctaBackground,
    "--color-on-cta-background": onPrimaryColor(ctaBackground),
    // Primary-button colors on dark and primary backgrounds.
    "--color-cta-dark": ctaDark,
    "--color-on-cta-dark": onPrimaryColor(ctaDark),
    "--color-cta-primary": ctaPrimary,
    "--color-on-cta-primary": onPrimaryColor(ctaPrimary),
    ...preset.vars,
    ...(radius === undefined ? {} : { "--radius-sm": `${radius}px`, "--radius-lg": `${radius}px` }),
    ...(theme?.spacing && SECTION_PAD[theme.spacing] ? { "--section-pad": SECTION_PAD[theme.spacing] } : {}),
    "--button-radius": buttonRadius,
    "--section-gap": "calc(var(--section-pad) / 2)",
    "--content-gap": "calc(var(--section-pad) / 4)",
    "--detail-gap": "calc(var(--section-pad) / 8)",
    "--card-hover-y": theme?.style === "modern" ? "-2px" : "0px",
    "--card-hover-shadow": theme?.style === "modern"
      ? "0 16px 36px -12px color-mix(in srgb, var(--color-text) 24%, transparent)"
      : "var(--shadow-card)",
    "--card-hover-border": theme?.style === "modern" ? "var(--color-border)" : "var(--color-secondary)",
    "--font-heading": fontFamily(headingFont),
    "--font-body": fontFamily(bodyFont),
  } as CSSProperties;
}
