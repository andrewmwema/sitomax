"use server";

import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createPhotoLibrary, photoSource } from "@/lib/photos";
import { PhotoError, photoSearchSchema } from "@/lib/photos/types";
import { getOrCreateInternalAccount } from "@/lib/accounts";
import { requireSuperAdmin } from "@/lib/auth";

const searchSchema = photoSearchSchema.extend({ siteId: z.uuid().optional(), agency: z.boolean().optional() })
  .refine((value) => Boolean(value.siteId) !== Boolean(value.agency), "Choose a site or agency media.");
const selectionSchema = searchSchema.safeExtend({ photoId: z.number().int().positive(), alt: z.string().trim().max(500).optional() });

async function libraryForSite(siteId: string | undefined, agency?: boolean) {
  if (agency) {
    const { supabase } = await requireSuperAdmin();
    const folder = await getOrCreateInternalAccount();
    return { library: createPhotoLibrary(supabase, folder), folder };
  }
  const { supabase } = await requireUser();
  const { data: site, error } = await supabase.from("sites").select("account_id").eq("id", siteId).maybeSingle();
  if (error) throw new PhotoError("Could not verify access to this site.");
  if (!site) throw new PhotoError("This site is unavailable to your account.");
  return { library: createPhotoLibrary(supabase, z.uuid().parse(site.account_id)), folder: siteId! };
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
    const { library } = await libraryForSite(parsed.data.siteId, parsed.data.agency);
    const { photos, hasMore } = await library.searchPage(parsed.data);
    return { status: "success" as const, source: photoSource, hasMore,
      photos: photos.map(({ id, previewUrl, alt }) => ({ id, previewUrl, alt })) };
  } catch (cause) { return failure(cause); }
}

export async function selectStockPhoto(raw: unknown) {
  const parsed = selectionSchema.safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid photo selection." };
  try {
    const { library, folder } = await libraryForSite(parsed.data.siteId, parsed.data.agency);
    const photo = await library.select({ ...parsed.data, siteId: folder });
    return { status: "success" as const, ...photo };
  } catch (cause) { return failure(cause); }
}
