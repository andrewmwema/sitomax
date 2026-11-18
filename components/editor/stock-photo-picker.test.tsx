// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), select: vi.fn() }));
vi.mock("@/app/editor/[pageId]/photo-actions", () => ({ searchStockPhotos: mocks.search, selectStockPhoto: mocks.select }));
import { StockPhotoPicker } from "./stock-photo-picker";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function find() {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "tools");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Search")!.click());
}
describe("stock photo picker", () => {
  it("attributes search previews and only applies the server-imported Storage URL", async () => {
    const onSelect = vi.fn();
    mocks.search.mockResolvedValue({ status: "success", source: { name: "Pixabay", url: "https://pixabay.com/" },
      photos: [{ id: 42, previewUrl: "https://cdn.pixabay.com/preview.jpg", alt: "Tools" }] });
    mocks.select.mockResolvedValue({ status: "success", url: "https://storage.example/site-assets/42.jpg" });
    await act(async () => root.render(<StockPhotoPicker siteId="site" onSelect={onSelect} />));
    await find();
    expect(container.textContent).toContain("Photos from Pixabay");
    expect(container.querySelector('a[href="https://pixabay.com/"]')).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.src).toBe("https://cdn.pixabay.com/preview.jpg");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Use Tools"]')!.click());
    expect(mocks.select).toHaveBeenCalledWith({ siteId: "site", query: "tools", orientation: "all", photoId: 42 });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("https://storage.example/site-assets/42.jpg");
  });
  it("keeps the existing image on empty results and failed imports", async () => {
    const onSelect = vi.fn();
    mocks.search.mockResolvedValueOnce({ status: "success", source: { name: "Pixabay", url: "https://pixabay.com/" }, photos: [] });
    await act(async () => root.render(<StockPhotoPicker siteId="site" onSelect={onSelect} />));
    await find();
    expect(container.textContent).toContain("placeholder is unchanged");
    expect(onSelect).not.toHaveBeenCalled();
    mocks.search.mockResolvedValueOnce({ status: "success", source: { name: "Pixabay", url: "https://pixabay.com/" },
      photos: [{ id: 42, previewUrl: "https://cdn.pixabay.com/preview.jpg", alt: "Tools" }] });
    await find();
    mocks.select.mockResolvedValueOnce({ status: "error", message: "Upload failed." });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Use Tools"]')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Upload failed.");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
