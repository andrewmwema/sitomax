// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), select: vi.fn(), options: vi.fn(), list: vi.fn(), prepare: vi.fn(), validate: vi.fn(), upload: vi.fn() }));
vi.mock("@/app/editor/[pageId]/photo-actions", () => ({ searchStockPhotos: mocks.search, selectStockPhoto: mocks.select }));
vi.mock("@/app/editor/[pageId]/media-actions", () => ({
  mediaOptions: mocks.options, listMedia: mocks.list, prepareMediaUpload: mocks.prepare, validateMediaUrl: mocks.validate,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload: mocks.upload }) } }) }));
import { ImageUploadField, EditorSiteContext } from "./image-upload-field";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const imported = "https://storage.example/site-assets/42.jpg";
const photo = { id: 42, previewUrl: "https://cdn.pixabay.com/preview.jpg", alt: "Tools" };
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
async function click(text: string) { await act(async () => button(text).click()); }
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function open(onSelect = vi.fn()) {
  await act(async () => root.render(<EditorSiteContext.Provider value={{ siteId: "site", query: "tools" }}>
    <ImageUploadField value="/existing.jpg" onChange={vi.fn()} onSelect={onSelect} />
  </EditorSiteContext.Provider>));
  button("Replace image").focus();
  await click("Replace image");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return onSelect;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.options.mockResolvedValue({ status: "success", isAdmin: false });
  mocks.search.mockResolvedValue({ status: "success", photos: [photo] });
  mocks.select.mockResolvedValue({ status: "success", url: imported, alt: "Tools" });
  mocks.list.mockResolvedValue({ status: "success", images: [], hasMore: false });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:local-preview"), revokeObjectURL: vi.fn() }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("unified media picker", () => {
  it("uploads only on confirmation and stores the edited alt as library metadata", async () => {
    const onSelect = await open();
    await click("Upload");
    mocks.prepare.mockResolvedValue({ status: "success", bucket: "site-assets", path: "site/team.png", url: imported });
    mocks.upload.mockResolvedValue({ error: null });
    const file = new File(["image bytes"], "Team photo.png", { type: "image/png" });
    const field = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(field, "files", { configurable: true, value: [file] });
    await act(async () => field.dispatchEvent(new Event("change", { bubbles: true })));
    expect(mocks.upload).not.toHaveBeenCalled();
    await input([...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Alt text"))!.querySelector("input")!, "Our workshop team");
    await click("Use image");
    expect(mocks.upload).toHaveBeenCalledWith("site/team.png", file, { contentType: "image/png", metadata: { alt: "Our workshop team" } });
    expect(onSelect).toHaveBeenCalledWith({ url: imported, alt: "Our workshop team" });
  });
  it("opens Stock by default, imports on confirmation with edited alt, and returns focus", async () => {
    const onSelect = await open();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Stock photos");
    expect(document.querySelector('a[href="https://pixabay.com/"]')).not.toBeNull();
    expect(button("Paste URL")).toBeUndefined();
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Select Tools"]')!.click());
    await input([...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Alt text"))!.querySelector("input")!, "Workshop tools");
    expect(onSelect).not.toHaveBeenCalled();
    await click("Use image");
    expect(mocks.select).toHaveBeenCalledWith({ siteId: "site", query: "tools", orientation: "all", page: 1, photoId: 42, alt: "Workshop tools" });
    expect(onSelect).toHaveBeenCalledWith({ url: imported, alt: "Workshop tools" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button("Replace image"));
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
  it("retains the current field on failed import and empty results", async () => {
    const onSelect = await open();
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Select Tools"]')!.click());
    mocks.select.mockResolvedValueOnce({ status: "error", message: "Upload failed." });
    await click("Use image");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Upload failed.");
    expect(onSelect).not.toHaveBeenCalled();
    mocks.search.mockResolvedValueOnce({ status: "success", photos: [] });
    await click("Search");
    expect(document.body.textContent).toContain("current image is unchanged");
  });
  it("loads the library, handles tab keyboard navigation and Escape, and gates URLs by server capability", async () => {
    mocks.options.mockResolvedValue({ status: "success", isAdmin: true });
    await open();
    expect(button("Paste URL")).toBeDefined();
    const stock = document.querySelector('[role="tab"]')!;
    await act(async () => stock.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Upload");
    await click("Media library");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(mocks.list).toHaveBeenCalledWith({ scope: { siteId: "site" }, query: "", offset: 0 });
    expect(document.body.textContent).toContain("No matching images");
    const alt = [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Alt text"))!.querySelector("input")!;
    const dialog = document.querySelector('[role="dialog"]')!;
    alt.focus();
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    const close = document.querySelector('button[aria-label="Close media picker"]');
    expect(document.activeElement).toBe(close);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(alt);
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("loads additional stock results with their originating page and does not apply preview URLs", async () => {
    mocks.search.mockResolvedValueOnce({ status: "success", hasMore: true, photos: Array.from({ length: 20 }, (_, id) => ({ ...photo, id: id + 1, previewUrl: `https://cdn.pixabay.com/${id}.jpg` })) });
    const onSelect = await open();
    mocks.search.mockResolvedValueOnce({ status: "success", photos: [photo] });
    await click("Load more");
    expect(mocks.search).toHaveBeenLastCalledWith({ siteId: "site", query: "tools", orientation: "all", page: 2 });
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Select Tools"]')].at(-1)!.click());
    await click("Use image");
    expect(mocks.select).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, photoId: 42 }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ url: imported }));
  });
});
