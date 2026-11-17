import { z } from "zod";

const imageUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (/^\/(?!\/)[^\\\x00-\x20]*$/.test(value)) return true;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Use a local path or an HTTP(S) image URL.");

export const siteSeoSchema = z.strictObject({
  socialImage: imageUrl.default(""),
  googleAnalyticsId: z.string().trim().regex(/^(?:|G-[A-Z0-9]{4,20})$/).default(""),
  metaPixelId: z.string().trim().regex(/^(?:|[0-9]{5,25})$/).default(""),
  googleVerification: z.string().trim().regex(/^(?:|[A-Za-z0-9_-]{1,200})$/).default(""),
  noindex: z.boolean().default(false),
});
export type SiteSeo = z.infer<typeof siteSeoSchema>;

export const pageSeoSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  image: imageUrl.optional(),
  noindex: z.boolean().nullable().optional(),
}).passthrough();

export const rootSeoSchema = z.object({
  title: z.string().max(500).optional(),
  seoTitle: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  socialImage: imageUrl.optional(),
  indexing: z.enum(["inherit", "index", "noindex"]).optional(),
}).passthrough();

export const redirectPathSchema = z.string().trim().min(1).max(2048)
  .regex(/^\/(?!\/)[^\\\x00-\x20]*$/, "Use a path starting with one / and no spaces or backslashes.");
export const redirectSchema = z.object({
  fromPath: redirectPathSchema.refine((value) => !/[?#]/.test(value), "The source must not include a query or fragment."),
  toPath: redirectPathSchema,
}).refine(({ fromPath, toPath }) => fromPath !== toPath, { message: "The destination must differ from the source.", path: ["toPath"] });

export function isNoindex(page: z.infer<typeof pageSeoSchema>, site: SiteSeo): boolean {
  return page.noindex ?? site.noindex;
}

export function absoluteImage(value: string | undefined, siteUrl: string): string | undefined {
  if (!value) return undefined;
  const parsed = imageUrl.safeParse(value);
  return parsed.success ? new URL(parsed.data, siteUrl).toString() : undefined;
}
