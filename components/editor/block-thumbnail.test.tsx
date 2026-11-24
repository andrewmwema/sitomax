// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BlockThumbnail } from "./block-thumbnail";

vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/lib/sections/catalog", () => ({
  sectionCatalog: [{ id: "hero", name: "Hero", blockType: "Hero", props: {} }],
  sectionContentMetadata: () => ({}),
}));
vi.mock("./design-thumbnail", () => ({
  DesignThumbnail: ({ compact, viewportWidth }: { compact?: boolean; viewportWidth?: number }) =>
    <div data-compact={String(compact)} data-viewport={viewportWidth}>Rendered preview</div>,
}));

afterEach(() => vi.unstubAllGlobals());

it("shows informative placeholders for empty layout and media blocks", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });

  for (const [name, text] of [
    ["Section", "Empty section"],
    ["Row", "Empty row"],
    ["Image", "Choose an image"],
    ["Video", "Add a video"],
    ["MapEmbed", "Add an address"],
    ["Embed", "Add embed code"],
  ]) {
    act(() => root.render(<BlockThumbnail name={name} theme={{}} />));
    expect(container.textContent).toContain(text);
  }
  act(() => root.unmount());
});

it("uses a compact live preview for elements and a full viewport for designed sections", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() {
      this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<BlockThumbnail name="Heading" theme={{}} />));
  expect(container.querySelector("[data-compact]")?.getAttribute("data-viewport")).toBe("480");
  expect(container.querySelector("[data-compact]")?.getAttribute("data-compact")).toBe("true");
  act(() => root.render(<BlockThumbnail name="Hero" theme={{}} />));
  expect(container.querySelector("[data-compact]")?.getAttribute("data-compact")).toBe("false");
  act(() => root.render(<BlockThumbnail name="Map" theme={{}} />));
  expect(container.querySelector("[data-compact]")?.getAttribute("data-compact")).toBe("false");
  act(() => root.unmount());
});
