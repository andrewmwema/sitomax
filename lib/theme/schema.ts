import { z } from "zod";
import { CURATED_FONT_NAMES } from "./fonts";

const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional();

export const themeSchema = z.object({
  style: z.enum(["classic", "modern"]).optional(),
  headingFont: z.enum(CURATED_FONT_NAMES).optional(),
  bodyFont: z.enum(CURATED_FONT_NAMES).optional(),
  radius: z.number().int().min(0).max(48).optional(),
  buttonStyle: z.enum(["rounded", "square", "pill"]).optional(),
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
});
