import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reserve: vi.fn(), upload: vi.fn(), cache: new Map<string, unknown>() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>, keys: string[], options: { revalidate: number }) => async () => {
  expect(options.revalidate).toBe(86400);
  const key = keys.join(":");
  if (!mocks.cache.has(key)) mocks.cache.set(key, await fn());
  return mocks.cache.get(key);
} }));
import { createPhotoLibrary } from "./index";
import { pixabay } from "./pixabay";

const accountId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const hit = {
  id: 42, type: "photo", tags: "tools, sink",
  webformatURL: "https://cdn.pixabay.com/photo/preview.jpg", largeImageURL: "https://cdn.pixabay.com/photo/1280.jpg",
  fullHDURL: "https://cdn.pixabay.com/photo/1920.jpg", imageURL: "https://cdn.pixabay.com/photo/original.jpg",
  imageWidth: 4000, imageHeight: 3000, imageSize: 4000000,
};
const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2]), { headers: { "content-type": "image/jpeg" } });
const search = (hits: object[] = [hit], totalHits = hits.length) => new Response(JSON.stringify({ hits, totalHits }), { headers: { "content-type": "application/json" } });
function client() {
  const supabase = createClient("https://storage.example", "public-test-key", { auth: { persistSession: false } });
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: {
    access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600,
    user: { id: accountId, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
  } }, error: null });
  const bucket = supabase.storage.from("site-assets");
  vi.spyOn(bucket, "upload").mockImplementation(mocks.upload);
  vi.spyOn(supabase.storage, "from").mockReturnValue(bucket);
  return supabase;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.cache.clear();
  vi.stubEnv("PIXABAY_API_KEY", "local-test-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(SupabaseClient.prototype, "rpc").mockImplementation(mocks.reserve);
  mocks.reserve.mockResolvedValue({ data: true, error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
});

describe("stock photo provider boundary", () => {
  it("separates cached pages and filters square results without sending an unsupported provider orientation", async () => {
    mocks.fetch.mockImplementation(async () => search([hit,
      { ...hit, id: 43, imageWidth: 2000, imageHeight: 2000 },
      { ...hit, id: 44, imageWidth: 2100, imageHeight: 2000 }], 40));
    const library = createPhotoLibrary(client(), accountId);
    const first = await library.searchPage({ query: "tools", orientation: "square", page: 1 });
    expect(first.photos.map((photo) => photo.id)).toEqual([43]);
    expect(first.hasMore).toBe(true);
    expect((await library.searchPage({ query: "tools", orientation: "square", page: 2 })).hasMore).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const url = mocks.fetch.mock.calls[1][0] as URL;
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ page: "2", orientation: "all" });
  });
  it("caches normalized queries for 24 hours and applies safe filters with a global allowance on misses", async () => {
    mocks.fetch.mockResolvedValue(search());
    const library = createPhotoLibrary(client(), accountId);
    await library.search({ query: "  Kitchen   SINK ", orientation: "horizontal" });
    await library.search({ query: "kitchen sink", orientation: "horizontal" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith("consume_photo_search", { p_account_id: accountId });
    const url = mocks.fetch.mock.calls[0][0] as URL;
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: "kitchen sink", image_type: "photo", safesearch: "true", orientation: "horizontal",
    });
  });
  it("downloads the largest allowed file and saves only our Storage URL under the site folder", async () => {
    mocks.fetch.mockResolvedValueOnce(search()).mockResolvedValueOnce(jpeg());
    const result = await createPhotoLibrary(client(), accountId).select({ query: "tools", photoId: 42, siteId, alt: "Workshop tools" });
    expect(mocks.fetch.mock.calls[1][0]).toBe(hit.imageURL);
    expect(mocks.upload).toHaveBeenCalledWith(`${siteId}/pixabay-42.jpg`, expect.any(Uint8Array), expect.objectContaining({
      contentType: "image/jpeg", upsert: false, metadata: { alt: "Workshop tools" },
    }));
    expect(result.url).toBe(`https://storage.example/storage/v1/object/public/site-assets/${siteId}/pixabay-42.jpg`);
    expect(result.url).not.toContain("pixabay.com");
    expect(result.alt).toBe("Workshop tools");
  });
  it("uses the largest public size when full API access is unavailable and ignores oversized originals", async () => {
    mocks.fetch.mockResolvedValueOnce(search([{ ...hit, imageURL: undefined, fullHDURL: undefined }]));
    expect((await pixabay.search({ query: "tools", orientation: "all" })).photos[0].downloadUrls[0]).toBe(hit.largeImageURL);
    mocks.fetch.mockResolvedValueOnce(search([{ ...hit, imageSize: 30 * 1024 * 1024 }]));
    expect((await pixabay.search({ query: "tools", orientation: "all" })).photos[0].downloadUrls[0]).toBe(hit.fullHDURL);
  });
  it("fails closed on rate limits, missing keys and missing photos without a download or upload", async () => {
    const library = createPhotoLibrary(client(), accountId);
    mocks.reserve.mockResolvedValueOnce({ data: false, error: null });
    await expect(library.search({ query: "tools" })).rejects.toThrow("wait a minute");
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(search([]));
    await expect(library.select({ query: "tools", photoId: 42, siteId })).rejects.toThrow("no longer available");
    expect(mocks.upload).not.toHaveBeenCalled();
    vi.stubEnv("PIXABAY_API_KEY", "");
    await expect(library.search({ query: "tools" })).rejects.toThrow("not configured");
  });
  it("rejects untrusted image hosts, unsafe redirects, invalid image bytes and oversized downloads", async () => {
    mocks.fetch.mockResolvedValueOnce(search([{ ...hit, imageURL: "https://example.com/steal" }]));
    await expect(pixabay.search({ query: "tools", orientation: "all" })).rejects.toThrow("invalid results");
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    const photo = { id: 42, previewUrl: "", alt: "", width: 1, height: 1, downloadUrls: [hit.largeImageURL] };
    await expect(pixabay.download(photo)).rejects.toThrow("could not be downloaded");
    mocks.fetch.mockResolvedValueOnce(new Response("<svg/>", { headers: { "content-type": "image/jpeg" } }));
    await expect(pixabay.download(photo)).rejects.toThrow("supported image");
    mocks.fetch.mockResolvedValueOnce(new Response("too big", { headers: { "content-length": String(21 * 1024 * 1024) } }));
    await expect(pixabay.download(photo)).rejects.toThrow("too large");
  });
  it("surfaces API throttling and Storage failures rather than returning remote URLs", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("private provider text", { status: 429 }));
    await expect(createPhotoLibrary(client(), accountId).search({ query: "tools" })).rejects.toThrow("wait a minute");
    mocks.fetch.mockResolvedValueOnce(search()).mockResolvedValueOnce(jpeg());
    mocks.upload.mockResolvedValueOnce({ data: null, error: { statusCode: "403" } });
    await expect(createPhotoLibrary(client(), accountId).select({ query: "tools", photoId: 42, siteId })).rejects.toThrow("could not be saved");
  });
});
