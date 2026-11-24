import "server-only";

import { z } from "zod";
import { createHash } from "node:crypto";
import { PhotoError, photoSearchSchema, type PhotoProvider, type StockPhoto } from "./types";

const MAX_BYTES = 20 * 1024 * 1024;
const imageUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && ["pixabay.com", "cdn.pixabay.com"].includes(url.hostname)
    && !url.port && !url.username && !url.password;
});
const sourceUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "pixabay.com"
    && !url.port && !url.username && !url.password;
});
const hitSchema = z.object({
  id: z.number().int().positive(), type: z.literal("photo"), tags: z.string(),
  pageURL: sourceUrl, user: z.string().min(1).max(200),
  webformatURL: imageUrl, largeImageURL: imageUrl,
  fullHDURL: imageUrl.optional(), imageURL: imageUrl.optional(),
  imageWidth: z.number().positive(), imageHeight: z.number().positive(),
  imageSize: z.number().nonnegative(),
});

async function downloadImage(photo: StockPhoto) {
  const url = photo.downloadUrls[0];
  if (!url || !imageUrl.safeParse(url).success) throw new PhotoError("This photo has an invalid download URL.");
  let response: Response;
  try {
    const signal = AbortSignal.timeout(15_000);
    let target = url;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(target, { signal, redirect: "manual", cache: "no-store" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      const next = location ? new URL(location, target).toString() : "";
      if (redirects >= 3 || !imageUrl.safeParse(next).success) throw new PhotoError("Invalid photo redirect.");
      target = next;
    }
  } catch {
    throw new PhotoError("The photo could not be downloaded. Please try another photo.");
  }
  if (!response.ok || !response.body) throw new PhotoError("The photo could not be downloaded. Please try another photo.");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body.cancel();
    throw new PhotoError("This photo is too large. Please choose another.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new PhotoError("This photo is too large. Please choose another.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  const jpeg = mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new PhotoError("The photo did not contain a supported image.");
  return { bytes, contentType: jpeg ? "image/jpeg" : png ? "image/png" : "image/webp",
    extension: jpeg ? "jpg" : png ? "png" : "webp" };
}

export const pixabay: PhotoProvider = {
  name: "Pixabay",
  url: "https://pixabay.com/",
  cacheKey() {
    const key = process.env.PIXABAY_API_KEY;
    if (!key) throw new PhotoError("Photo search is not configured.");
    return createHash("sha256").update(key).digest("hex");
  },
  async search(raw) {
    const { query, orientation, page } = photoSearchSchema.parse(raw);
    const key = process.env.PIXABAY_API_KEY;
    if (!key) throw new PhotoError("Photo search is not configured.");
    const url = new URL("https://pixabay.com/api/");
    url.search = new URLSearchParams({
      key, q: query, image_type: "photo", safesearch: "true",
      orientation: orientation === "square" ? "all" : orientation, per_page: "20", page: String(page),
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000), redirect: "error", cache: "no-store" });
    } catch {
      throw new PhotoError("Photo search could not be reached. Please retry.");
    }
    if (response.status === 429) throw new PhotoError("Photo search is busy. Please wait a minute and retry.");
    if (!response.ok) throw new PhotoError("Photo search failed. Please retry.");
    const parsed = z.object({ hits: z.array(hitSchema), totalHits: z.number().int().nonnegative() }).safeParse(await response.json());
    if (!parsed.success) throw new PhotoError("Photo search returned invalid results.");
    const photos = parsed.data.hits.filter((hit) => orientation !== "square" || hit.imageWidth === hit.imageHeight).map((hit) => ({
      id: hit.id, previewUrl: hit.webformatURL, alt: `Stock photograph: ${hit.tags}`,
      sourceUrl: hit.pageURL, author: hit.user,
      width: hit.imageWidth, height: hit.imageHeight,
      downloadUrls: [...new Set([
        ...(hit.imageURL && hit.imageSize <= MAX_BYTES ? [hit.imageURL] : []),
        ...(hit.fullHDURL ? [hit.fullHDURL] : []), hit.largeImageURL,
      ])],
    }));
    return { photos, hasMore: page * 20 < Math.min(parsed.data.totalHits, 500) };
  },
  download: downloadImage,
};
