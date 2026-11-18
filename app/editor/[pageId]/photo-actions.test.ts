import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), search: vi.fn(), select: vi.fn(), library: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }),
} }) }));
vi.mock("@/lib/photos", () => ({ photoSource: { name: "Pixabay", url: "https://pixabay.com/" }, createPhotoLibrary: mocks.library }));
import { searchStockPhotos, selectStockPhoto } from "./photo-actions";
import { PhotoError } from "@/lib/photos/types";

const siteId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.lookup.mockResolvedValue({ data: { account_id: accountId }, error: null });
  mocks.library.mockReturnValue({ searchPage: async (raw: unknown) => ({ photos: await mocks.search(raw), hasMore: false }), select: mocks.select });
});
describe("editor stock photo actions", () => {
  it("checks site RLS access before searching or selecting", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    expect(await searchStockPhotos({ siteId, query: "tools" })).toMatchObject({ status: "error", message: expect.stringContaining("unavailable") });
    expect(await selectStockPhoto({ siteId, query: "tools", photoId: 42 })).toMatchObject({ status: "error" });
    expect(mocks.library).not.toHaveBeenCalled();
  });
  it("returns provider attribution with previews but never exposes download URLs", async () => {
    mocks.search.mockResolvedValue([{ id: 42, previewUrl: "https://cdn.pixabay.com/preview.jpg", alt: "Tools", downloadUrls: ["private-download"] }]);
    expect(await searchStockPhotos({ siteId, query: "tools" })).toEqual({ status: "success",
      source: { name: "Pixabay", url: "https://pixabay.com/" }, hasMore: false, photos: [
        { id: 42, previewUrl: "https://cdn.pixabay.com/preview.jpg", alt: "Tools" },
      ] });
    expect(mocks.library).toHaveBeenCalledWith(expect.anything(), accountId);
  });
  it("accepts only a photo ID plus search context, never a caller-provided download URL", async () => {
    mocks.select.mockResolvedValue({ url: "https://storage.example/42.jpg", alt: "Tools" });
    expect(await selectStockPhoto({ siteId, query: "TOOLS", photoId: 42, url: "http://127.0.0.1" }))
      .toMatchObject({ status: "success", url: "https://storage.example/42.jpg" });
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith({ siteId, query: "tools", orientation: "all", page: 1, photoId: 42 });
    expect(await selectStockPhoto({ siteId, query: "tools", photoId: -1 })).toMatchObject({ status: "error" });
  });
  it("shows expected failures and withholds raw request or credential-bearing errors", async () => {
    mocks.search.mockRejectedValueOnce(new PhotoError("Photo search is busy."));
    expect(await searchStockPhotos({ siteId, query: "tools" })).toMatchObject({ status: "error", message: "Photo search is busy." });
    mocks.select.mockRejectedValueOnce(new Error("private provider response"));
    expect(await selectStockPhoto({ siteId, query: "tools", photoId: 42 })).toEqual({ status: "error", message: "The photo request failed. Please retry." });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private provider response");
  });
});
