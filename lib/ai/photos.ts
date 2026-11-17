import "server-only";

import { z } from "zod";
import type { Field } from "@puckeditor/core";
import { blockFields, isImageField } from "./site-schemas";
import type { PhotoCredit } from "./photo-credit";
const httpsHost = (hostname: string) => z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === hostname && !url.username && !url.password;
});
const photoSchema = z.object({
  urls: z.object({ regular: httpsHost("images.unsplash.com") }),
  alt_description: z.string().nullable(),
  user: z.object({ name: z.string().min(1), links: z.object({ html: httpsHost("unsplash.com") }) }),
  links: z.object({ html: httpsHost("unsplash.com"), download_location: httpsHost("api.unsplash.com") }),
});
const referral = (value: string) => {
  const url = new URL(value);
  url.searchParams.set("utm_source", "agency_sites");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
};

async function findPhoto(query: string, key: string): Promise<PhotoCredit | null> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("content_filter", "high");
  const options = { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(8000), cache: "no-store" as const, redirect: "error" as const };
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Photo search failed (${response.status}).`);
  const { results } = z.object({ results: z.array(photoSchema) }).parse(await response.json());
  const photo = results[0];
  if (!photo) return null;
  const download = await fetch(photo.links.download_location, { ...options, signal: AbortSignal.timeout(8000) });
  if (!download.ok) throw new Error(`Photo selection could not be recorded (${download.status}).`);
  return {
    url: photo.urls.regular, alt: `Stock photograph: ${photo.alt_description || query}`,
    photographer: photo.user.name, photographerUrl: referral(photo.user.links.html), sourceUrl: referral(photo.links.html),
  };
}

export function createPhotoResolver(warnings: Set<string>) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const deadline = Date.now() + 60_000;
  const cache = new Map<string, Promise<PhotoCredit | null>>();
  return async (query: string) => {
    if (!query) return null;
    if (!key) {
      warnings.add("Photo search is not configured. Image placeholders were used.");
      return null;
    }
    if (cache.has(query)) return cache.get(query)!;
    if (Date.now() >= deadline) {
      warnings.add("Photo search reached its time budget. Remaining images use placeholders.");
      return null;
    }
    if (!cache.has(query)) cache.set(query, findPhoto(query, key).then((photo) => {
      if (!photo) warnings.add("Some photos had no matching results. Image placeholders were used.");
      return photo;
    }).catch((cause) => {
      // Photos are optional; degrade visibly without exposing keys or search text.
      console.error("AI photo lookup failed", { message: cause instanceof Error ? cause.message : "Unknown photo error" });
      warnings.add("Some photos could not be found. Image placeholders were used.");
      return null;
    }));
    return cache.get(query)!;
  };
}

/** Field-driven traversal covers nested array/object images, not guessed key names. */
export async function fillSectionPhotos(
  type: string, props: Record<string, unknown>, resolve: ReturnType<typeof createPhotoResolver>,
): Promise<PhotoCredit[]> {
  const credits: PhotoCredit[] = [];
  const walk = async (record: Record<string, unknown>, fields: Record<string, Field>) => {
    for (const [key, field] of Object.entries(fields)) {
      const value = record[key];
      if (isImageField(field)) {
        const query = typeof value === "string" ? value : "";
        // Stock portraits/logos would imply invented staff or endorsements.
        const photo = type === "Team" || type === "Logos" ? null : await resolve(query);
        record[key] = photo?.url ?? "";
        const altKey = key === "url" ? "alt" : key === "image" ? "imageAlt" : `${key}Alt`;
        if (photo) {
          record[altKey] = photo.alt;
          credits.push(photo);
        } else if (altKey in fields) record[altKey] = "Image placeholder";
      } else if (field.type === "array" && Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && !Array.isArray(child)) {
          await walk(child, field.arrayFields as Record<string, Field>);
        }
      } else if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        await walk(value as Record<string, unknown>, field.objectFields as Record<string, Field>);
      }
    }
  };
  await walk(props, blockFields(type));
  return credits;
}
