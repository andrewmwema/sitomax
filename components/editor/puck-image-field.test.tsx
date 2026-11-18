// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaImage } from "@/lib/media";

const mocks = vi.hoisted(() => ({ get: vi.fn(), select: null as null | ((image: MediaImage) => void), dispatch: vi.fn() }));
vi.mock("@puckeditor/core", () => ({ useGetPuck: () => mocks.get }));
vi.mock("./image-upload-field", () => ({
  ImageUploadField: ({ onSelect }: { onSelect: (image: MediaImage) => void }) => { mocks.select = onSelect; return null; },
}));
import { PuckImageField } from "./puck-image-field";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const image = { url: "https://storage.example/new.jpg", alt: "Workshop tools" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("Puck media dispatch", () => {
  it("replaces nested images and sibling alt in one undoable dispatch, preserving nested zones and removing stale credits", async () => {
    const old = "https://images.unsplash.com/old";
    mocks.get.mockReturnValue({
      selectedItem: { type: "Gallery", props: { id: "gallery", images: [{ url: old, alt: "Old" }], photoCredits: [{ url: old }] } },
      appState: { ui: { itemSelector: { index: 2, zone: "column:content" } } }, dispatch: mocks.dispatch, getPermissions: () => ({ edit: true }),
    });
    await act(async () => root.render(<PuckImageField name="images[0].url" value={old} onChange={vi.fn()} />));
    await act(async () => mocks.select!(image));
    expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "replace", destinationIndex: 2, destinationZone: "column:content", recordHistory: true,
      data: { type: "Gallery", props: { id: "gallery", images: [image], photoCredits: [] } },
    });
  });
  it("updates page root images without losing existing content", async () => {
    mocks.get.mockReturnValue({
      selectedItem: null, appState: { data: { content: [{ type: "Hero" }], root: { props: { title: "Home", socialImage: "" } } } },
      dispatch: mocks.dispatch, getPermissions: () => ({ edit: true }),
    });
    await act(async () => root.render(<PuckImageField name="socialImage" value="" onChange={vi.fn()} />));
    await act(async () => mocks.select!(image));
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "setData", recordHistory: true, data: { content: [{ type: "Hero" }], root: { props: {
        title: "Home", socialImage: image.url, socialImageAlt: image.alt,
      } } },
    }));
  });
});
