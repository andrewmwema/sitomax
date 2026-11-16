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
  colors: z
    .object({
      primary: colorSchema,
      secondary: colorSchema,
      background: colorSchema,
      text: colorSchema,
    })
    .optional(),
  logoUrl: z.union([z.url(), z.literal("")]).optional(),
});
