import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Field } from "@puckeditor/core";
import { blockFields, isImageField } from "./site-schemas";
import { createPhotoLibrary } from "@/lib/photos";
import { PhotoError, type StoredPhoto } from "@/lib/photos/types";
import type { PhotoCredit } from "./photo-credit";

export function createPhotoResolver(
  warnings: Set<string>, context: { supabase: SupabaseClient; accountId: string; siteId: string },
) {
  const library = createPhotoLibrary(context.supabase, context.accountId);
  const deadline = Date.now() + 60_000;
  const cache = new Map<string, Promise<StoredPhoto | null>>();
  return async (query: string, orientation: "all" | "horizontal" | "vertical" = "all") => {
    if (!query) return null;
    const cacheKey = `${orientation}:${query.trim().toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    if (Date.now() >= deadline) {
      warnings.add("Photo search reached its time budget. Remaining images use placeholders.");
      return null;
    }
    const result = (async () => {
      try {
        const search = { query: query.trim().slice(0, 100), orientation };
        const [photo] = await library.search(search);
        if (!photo) {
          warnings.add("Some photos had no matching results. Image placeholders were used.");
          return null;
        }
        return await library.select({ ...search, photoId: photo.id, siteId: context.siteId });
      } catch (cause) {
        console.error("AI photo lookup failed", { type: cause instanceof Error ? cause.name : "Unknown" });
        warnings.add(cause instanceof PhotoError ? `${cause.message} Image placeholders were used.`
          : "Some photos could not be saved. Image placeholders were used.");
        return null;
      }
    })();
    cache.set(cacheKey, result);
    return result;
  };
}

/** Field-driven traversal covers nested array/object images, not guessed key names. */
export async function fillSectionPhotos(
  type: string, props: Record<string, unknown>, resolve: ReturnType<typeof createPhotoResolver>,
): Promise<PhotoCredit[]> {
  const walk = async (record: Record<string, unknown>, fields: Record<string, Field>) => {
    for (const [key, field] of Object.entries(fields)) {
      const value = record[key];
      if (isImageField(field)) {
        const query = typeof value === "string" ? value : "";
        // Stock portraits/logos would imply invented staff or endorsements.
        const photo = type === "Team" || type === "Logos" ? null
          : await resolve(query, type === "Hero" ? "horizontal" : "all");
        record[key] = photo?.url ?? "";
        const altKey = key === "url" || key === "src" ? "alt" : key === "image" ? "imageAlt" : `${key}Alt`;
        if (photo) record[altKey] = photo.alt;
        else if (altKey in fields) record[altKey] = "Image placeholder";
      } else if (field.type === "array" && Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && !Array.isArray(child)) {
          await walk(child, field.arrayFields as Record<string, Field>);
        }
      } else if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        await walk(value as Record<string, unknown>, field.objectFields as Record<string, Field>);
      } else if (field.type === "slot" && Array.isArray(value)) {
        for (const child of value) {
          if (!child || typeof child !== "object" || Array.isArray(child)) continue;
          const item = child as { type?: unknown; props?: unknown };
          if (typeof item.type === "string" && item.props && typeof item.props === "object" && !Array.isArray(item.props)) {
            await walk(item.props as Record<string, unknown>, blockFields(item.type));
          }
        }
      }
    }
  };
  await walk(props, blockFields(type));
  // Only legacy Unsplash photos carry public attribution records.
  return [];
}
