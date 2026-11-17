import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPhotoResolver, fillSectionPhotos } from "./photos";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "local-test-not-a-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
const photo = { urls: { regular: "https://images.unsplash.com/photo-1?ixid=original" }, alt_description: "Kitchen sink",
  user: { name: "Photographer", links: { html: "https://unsplash.com/@photographer" } },
  links: { html: "https://unsplash.com/photos/photo-1", download_location: "https://api.unsplash.com/photos/photo-1/download?ixid=original" } };
describe("generator photography", () => {
  it("searches nested image fields, hotlinks original URLs, records downloads and stores visible attribution and alt", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [photo] }) }).mockResolvedValueOnce({ ok: true });
    const warnings = new Set<string>();
    const props = { images: [{ url: "plumber kitchen sink", alt: "" }] };
    const credits = await fillSectionPhotos("Gallery", props, createPhotoResolver(warnings));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("query=plumber+kitchen+sink");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/download?ixid=original");
    expect(props.images[0].url).toBe(photo.urls.regular);
    expect(props.images[0].alt).toBe("Stock photograph: Kitchen sink");
    expect(credits[0]).toMatchObject({ photographer: "Photographer", photographerUrl: expect.stringContaining("utm_medium=referral") });
  });
  it("uses placeholders without a key or on photo errors, with explicit warnings", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    const warnings = new Set<string>(), props = { image: "plumbing tools", imageAlt: "" };
    await fillSectionPhotos("ImageWithText", props, createPhotoResolver(warnings));
    expect(props.image).toBe(""); expect(warnings.size).toBe(1); expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "local-test-not-a-key");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const props2 = { image: "plumbing tools", imageAlt: "" };
    await fillSectionPhotos("ImageWithText", props2, createPhotoResolver(warnings));
    expect(props2.image).toBe(""); expect(warnings.size).toBe(2);
  });
  it("does not fetch untrusted API URLs or create stock staff endorsements", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ ...photo, links: { ...photo.links, download_location: "https://example.com/steal" } }] }) });
    const warnings = new Set<string>();
    const props = { images: [{ url: "tools", alt: "" }] };
    expect(await fillSectionPhotos("Gallery", props, createPhotoResolver(warnings))).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fillSectionPhotos("Team", { members: [{ image: "person", imageAlt: "" }] }, createPhotoResolver(warnings));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
