import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/media-server", () => ({ mediaAccess: mocks.access }));
import { listMedia, mediaOptions, prepareMediaUpload, validateMediaUrl } from "./media-actions";

const siteId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.access.mockResolvedValue({ siteId, isAdmin: false, supabase: {
    rpc: mocks.rpc, storage: { from: (bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${bucket}/${path}` } }),
    }) },
  } });
});
describe("media picker server boundary", () => {
  it("withholds the URL capability and rejects pasted URLs from non-admins", async () => {
    expect(await mediaOptions({ siteId })).toEqual({ status: "success", isAdmin: false });
    expect(await validateMediaUrl({ siteId }, "https://example.com/image.jpg")).toMatchObject({ status: "error", message: expect.stringContaining("Only the agency") });
    mocks.access.mockResolvedValueOnce({ isAdmin: true });
    expect(await validateMediaUrl({ siteId }, "javascript:alert(1)")).toMatchObject({ status: "error" });
    mocks.access.mockResolvedValueOnce({ isAdmin: true });
    expect(await validateMediaUrl({ siteId }, "https://example.com/image.jpg")).toEqual({ status: "success", url: "https://example.com/image.jpg" });
  });
  it("enforces upload limits/types and preserves searchable filenames without sending file bodies through actions", async () => {
    const file = { name: "Team photo.png", type: "image/png", size: 1024, alt: "Our team" };
    expect(await prepareMediaUpload({ siteId }, { ...file, type: "image/svg+xml" })).toMatchObject({ status: "error" });
    expect(await prepareMediaUpload({ siteId }, { ...file, size: 51 * 1024 * 1024 })).toMatchObject({ status: "error" });
    expect(await prepareMediaUpload({ agency: true }, { ...file, size: 3 * 1024 * 1024 })).toMatchObject({ status: "error" });
    expect(await prepareMediaUpload({ siteId }, file)).toMatchObject({
      status: "success", bucket: "site-assets", path: expect.stringMatching(new RegExp(`^${siteId}/Team-photo-.*\\.png$`)), alt: "Our team",
    });
  });
  it("passes site-scoped filename/alt search and pagination to the authorized database function", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ bucket: "site-assets", path: `${siteId}/legacy.png`, name: "legacy.png", alt: "Team" }], error: null });
    expect(await listMedia({ scope: { siteId }, query: "Team", offset: 24 })).toEqual({
      status: "success", images: [{ url: `https://storage.example/site-assets/${siteId}/legacy.png`, name: "legacy.png", alt: "Team" }], hasMore: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_site_media", { p_site_id: siteId, p_query: "Team", p_offset: 24, p_agency: false });
    mocks.access.mockRejectedValueOnce(new Error("This site is unavailable to your account."));
    expect(await listMedia({ scope: { siteId }, query: "", offset: 0 })).toMatchObject({ status: "error" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(await listMedia({ scope: { siteId, agency: true }, query: "", offset: 0 })).toMatchObject({ status: "error" });
  });
});
