import { z } from "zod";
import { CURATED_FONT_NAMES } from "./fonts";

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional();

const mobileStickyCtaHrefSchema = z.string().trim().min(1).max(512).refine(
  (href) =>
    (href.startsWith("/") && !href.startsWith("//")) ||
    /^#[A-Za-z0-9_-]+$/.test(href) ||
    /^tel:\+?[0-9][0-9 ().-]*$/.test(href),
  "Use a site path, section anchor or phone number.",
);

export const themeSchema = z.object({
  style: z.enum(["classic", "modern"]).optional(),
  headingFont: z.enum(CURATED_FONT_NAMES).optional(),
  bodyFont: z.enum(CURATED_FONT_NAMES).optional(),
  radius: z.number().int().min(0).max(48).optional(),
  buttonStyle: z.enum(["rounded", "square", "pill"]).optional(),
  /** Space above and below sections; the style preset's own when unset. */
  spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  colors: z
    .object({
      primary: colorSchema,
      secondary: colorSchema,
      accent: colorSchema,
      background: colorSchema,
      text: colorSchema,
    })
    .optional(),
  logoUrl: z.union([z.url(), z.literal("")]).optional(),
  logoAlt: z.string().max(500).optional(),
  faviconUrl: z.union([z.url(), z.literal("")]).optional(),
  mobileStickyCta: z.object({
    enabled: z.boolean().default(false),
    label: z.string().trim().min(1).max(40).default("Get a quote"),
    href: mobileStickyCtaHrefSchema.default("/contact"),
  }).optional(),
});
