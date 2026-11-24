import "server-only";

import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pixabay } from "./pixabay";
import { PhotoError, photoSearchSchema, type PhotoProvider, type StoredPhoto } from "./types";

const provider: PhotoProvider = pixabay;
export const photoSource = { name: provider.name, url: provider.url };

export function createPhotoLibrary(supabase: SupabaseClient, accountId: string) {
  z.uuid().parse(accountId);
  const searchPage = async (raw: z.input<typeof photoSearchSchema>) => {
    const input = photoSearchSchema.parse(raw);
    const keyHash = provider.cacheKey();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) throw new PhotoError("Sign in again to search photos.");
    // Results are public stock photos, shared across tenants. The caller must
    // authorize account access before using this server-only library.
    return unstable_cache(async () => {
      // Snapshot the bearer outside the cache; never read request cookies here.
      const quota = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        accessToken: async () => session.access_token,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: allowed, error } = await quota.rpc("consume_photo_search", { p_account_id: accountId });
      if (error) throw new PhotoError("Could not check the photo search limit. Apply migration 0020 and retry.");
      if (allowed !== true) throw new PhotoError("Photo search is busy. Please wait a minute and retry.");
      return provider.search(input);
    }, ["stock-photo-search-v4", provider.name, keyHash, input.query, input.orientation, String(input.page)], { revalidate: 86400 })();
  };
  const search = async (raw: z.input<typeof photoSearchSchema>) => (await searchPage(raw)).photos;
  return {
    search,
    searchPage,
    async select(raw: z.input<typeof photoSearchSchema> & { photoId: number; siteId: string; alt?: string }): Promise<StoredPhoto> {
      const { photoId, siteId, alt } = z.object({ photoId: z.number().int().positive(), siteId: z.uuid(), alt: z.string().max(500).optional() }).parse(raw);
      const photo = (await search(raw)).find(({ id }) => id === photoId);
      if (!photo) throw new PhotoError("That photo is no longer available. Search again.");
      const file = await provider.download(photo);
      const bucket = supabase.storage.from("site-assets");
      const path = `${siteId}/${provider.name.toLowerCase()}-source-${photo.id}.${file.extension}`;
      const { error } = await bucket.upload(path, file.bytes, { contentType: file.contentType, cacheControl: "31536000",
        metadata: { alt: alt ?? photo.alt, source_provider: provider.name, source_id: photo.id,
          source_url: photo.sourceUrl, source_author: photo.author }, upsert: false });
      if (error?.statusCode === "409") {
        const existing = await bucket.info(path);
        const metadata = z.object({ source_provider: z.literal(provider.name), source_id: z.number(),
          source_url: z.string(), source_author: z.string() }).safeParse(existing.data?.metadata);
        if (existing.error || !metadata.success || metadata.data.source_id !== photo.id
          || metadata.data.source_url !== photo.sourceUrl) {
          throw new PhotoError("The existing photo source could not be verified. Please choose another photo.");
        }
      } else if (error) throw new PhotoError("The photo could not be saved to site assets. Please retry.");
      return { url: bucket.getPublicUrl(path).data.publicUrl, alt: alt ?? photo.alt };
    },
  };
}
