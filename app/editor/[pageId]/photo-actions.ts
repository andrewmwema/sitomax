"use server";

import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createPhotoLibrary, photoSource } from "@/lib/photos";
import { PhotoError, photoSearchSchema } from "@/lib/photos/types";

const searchSchema = photoSearchSchema.extend({ siteId: z.uuid() });
const selectionSchema = searchSchema.extend({ photoId: z.number().int().positive() });

async function libraryForSite(siteId: string) {
  const { supabase } = await requireUser();
  const { data: site, error } = await supabase.from("sites").select("account_id").eq("id", siteId).maybeSingle();
  if (error) throw new PhotoError("Could not verify access to this site.");
  if (!site) throw new PhotoError("This site is unavailable to your account.");
  return createPhotoLibrary(supabase, z.uuid().parse(site.account_id));
}

function failure(cause: unknown) {
  unstable_rethrow(cause);
  console.error("Stock photo action failed", { type: cause instanceof Error ? cause.name : "Unknown" });
  return { status: "error" as const, message: cause instanceof PhotoError ? cause.message : "The photo request failed. Please retry." };
}

export async function searchStockPhotos(raw: unknown) {
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: parsed.error.issues[0]?.message ?? "Invalid photo search." };
  try {
    const library = await libraryForSite(parsed.data.siteId);
    const results = await library.search(parsed.data);
    return { status: "success" as const, source: photoSource,
      photos: results.map(({ id, previewUrl, alt }) => ({ id, previewUrl, alt })) };
  } catch (cause) { return failure(cause); }
}

export async function selectStockPhoto(raw: unknown) {
  const parsed = selectionSchema.safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid photo selection." };
  try {
    const library = await libraryForSite(parsed.data.siteId);
    const photo = await library.select(parsed.data);
    return { status: "success" as const, ...photo };
  } catch (cause) { return failure(cause); }
}
