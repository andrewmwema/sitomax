import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ search: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/photos", () => ({ createPhotoLibrary: () => mocks }));
import { createPhotoResolver, fillSectionPhotos } from "./photos";
import { PhotoError } from "@/lib/photos/types";

const context = { supabase: createClient("https://storage.example", "public-test-key", { auth: { persistSession: false } }),
  accountId: "account", siteId: "site" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.search.mockResolvedValue([{ id: 42 }]);
  mocks.select.mockResolvedValue({ url: "https://storage.example/site-assets/site/pixabay-42.jpg", alt: "Stock photograph: Kitchen sink" });
});
describe("generator photography", () => {
  it("uses stored photos for nested images, deduplicates selections and creates no public credits", async () => {
    const warnings = new Set<string>();
    const props = { images: [{ url: "plumber kitchen sink", alt: "" }, { url: "plumber kitchen sink", alt: "" }] };
    const credits = await fillSectionPhotos("Gallery", props, createPhotoResolver(warnings, context));
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({ query: "plumber kitchen sink", orientation: "all" });
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith({
      query: "plumber kitchen sink", orientation: "all", photoId: 42, siteId: "site",
    });
    expect(props.images[0].url).toBe("https://storage.example/site-assets/site/pixabay-42.jpg");
    expect(props.images[0].alt).toBe("Stock photograph: Kitchen sink");
    expect(credits).toEqual([]);
    expect(warnings.size).toBe(0);
  });
  it("uses placeholders for no matches and reports failed downloads explicitly", async () => {
    mocks.search.mockResolvedValueOnce([]);
    const warnings = new Set<string>(), props = { image: "plumbing tools", imageAlt: "" };
    await fillSectionPhotos("ImageWithText", props, createPhotoResolver(warnings, context));
    expect(props.image).toBe(""); expect(warnings.size).toBe(1); expect(mocks.select).not.toHaveBeenCalled();
    mocks.select.mockRejectedValueOnce(new PhotoError("Photo search is busy."));
    await fillSectionPhotos("ImageWithText", { image: "other tools", imageAlt: "" }, createPhotoResolver(warnings, context));
    expect(warnings.size).toBe(2);
    expect([...warnings].join(" ")).toContain("Photo search is busy.");
  });
  it("requests landscape hero photos but never stock portraits or logos", async () => {
    const resolve = createPhotoResolver(new Set(), context);
    await fillSectionPhotos("Hero", { backgroundImage: "tools" }, resolve);
    expect(mocks.search).toHaveBeenCalledWith({ query: "tools", orientation: "horizontal" });
    mocks.search.mockClear();
    await fillSectionPhotos("Team", { members: [{ image: "person", imageAlt: "" }] }, resolve);
    await fillSectionPhotos("Logos", { logos: [{ image: "logo" }] }, resolve);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
