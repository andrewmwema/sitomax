"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { mediaAccess } from "@/lib/media-server";
import { IMAGE_TYPES, MediaError, mediaScopeSchema, mediaUrlSchema, type MediaScope } from "@/lib/media";

function failure(cause: unknown) {
  unstable_rethrow(cause);
  console.error("Media operation failed", { type: cause instanceof Error ? cause.name : "Unknown" });
  return { status: "error" as const, message: cause instanceof z.ZodError
    ? "Invalid media request." : cause instanceof MediaError ? cause.message : "The media request failed. Please retry." };
}

export async function mediaOptions(scope: MediaScope) {
  try {
    const { isAdmin } = await mediaAccess(scope);
    return { status: "success" as const, isAdmin };
  } catch (cause) { return failure(cause); }
}

export async function listMedia(raw: unknown) {
  const parsed = z.object({ scope: mediaScopeSchema, query: z.string().trim().max(100), offset: z.number().int().min(0).max(100000) }).safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid library search." };
  try {
    const { supabase, siteId } = await mediaAccess(parsed.data.scope);
    const { data, error } = await supabase.rpc("list_site_media", {
      p_site_id: siteId, p_query: parsed.data.query, p_offset: parsed.data.offset, p_agency: parsed.data.scope.agency ?? false,
    });
    if (error) {
      console.error("Could not list site media", { code: error.code });
      return { status: "error" as const, message: "Could not load media. Apply migration 0021 and retry." };
    }
    const rows = z.array(z.object({ bucket: z.string(), path: z.string(), name: z.string(), alt: z.string() })).parse(data);
    return { status: "success" as const, images: rows.map((row) => ({
      url: supabase.storage.from(row.bucket).getPublicUrl(row.path).data.publicUrl, alt: row.alt, name: row.name,
    })), hasMore: rows.length === 24 };
  } catch (cause) { return failure(cause); }
}

export async function prepareMediaUpload(scope: MediaScope, raw: unknown) {
  try {
    const { supabase, siteId } = await mediaAccess(scope);
    const file = z.object({ name: z.string().min(1).max(255), type: z.string().max(100),
      size: z.number().int().positive(), alt: z.string().trim().max(500) }).parse(raw);
    const agency = scope.agency === true;
    const extension = IMAGE_TYPES[file.type] ?? (agency && file.type === "image/svg+xml" ? "svg" : undefined);
    const max = agency ? 2 : 50;
    if (!extension || (agency && !["png", "jpg", "svg", "webp"].includes(extension))) {
      return { status: "error" as const, message: agency ? "Use PNG, JPEG, SVG or WebP." : "Use JPEG, PNG, GIF, WebP or AVIF. SVG is not allowed." };
    }
    if (file.size > max * 1024 * 1024) return { status: "error" as const, message: `Images must be ${max} MB or smaller.` };
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "image";
    const bucketName = agency ? "branding" : "site-assets";
    const bucket = supabase.storage.from(bucketName);
    const path = `${agency ? "" : `${siteId}/`}${name}-${crypto.randomUUID()}.${extension}`;
    return { status: "success" as const, bucket: bucketName, path, url: bucket.getPublicUrl(path).data.publicUrl, alt: file.alt };
  } catch (cause) { return failure(cause); }
}

export async function validateMediaUrl(scope: MediaScope, raw: unknown) {
  try {
    const { isAdmin } = await mediaAccess(scope);
    if (!isAdmin) return { status: "error" as const, message: "Only the agency can paste image URLs." };
    const parsed = mediaUrlSchema.safeParse(raw);
    return parsed.success ? { status: "success" as const, url: parsed.data }
      : { status: "error" as const, message: parsed.error.issues[0].message };
  } catch (cause) { return failure(cause); }
}
