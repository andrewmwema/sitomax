import { z } from "zod";
import { safeMediaUrl } from "@/lib/sections/design";

export const mediaScopeSchema = z.object({ siteId: z.uuid().optional(), agency: z.boolean().optional() })
  .refine((value) => Boolean(value.siteId) !== Boolean(value.agency), "Choose a site or agency media.");
export type MediaScope = z.infer<typeof mediaScopeSchema>;
export type MediaImage = { url: string; alt: string; name?: string };
export class MediaError extends Error { name = "MediaError"; }
export const mediaUrlSchema = z.string().trim().min(1).max(2000).refine((value) => {
  if (safeMediaUrl(value) === null) return false;
  const url = new URL(value, "https://placeholder.invalid");
  return !url.username && !url.password;
},
  "Use an HTTPS image URL or a local path.");
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};
