// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignThumbnail } from "./design-thumbnail";
import type { SectionDesign } from "@/lib/sections/catalog";

vi.mock("@puckeditor/core", () => ({
  Render: () => <div>Section content</div>,
}));
vi.mock("@/lib/puck/config", () => ({
  puckConfig: { components: { Hero: { defaultProps: {} } } },
}));
vi.mock("@/lib/theme/presets", () => ({ buildThemeStyle: () => ({}) }));

const design = {
  id: "test",
  name: "Test",
  blockType: "Hero",
  props: {},
} as SectionDesign;

let contentHeight: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  contentHeight = 400;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() {
      this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      if (element.classList.contains("design-thumb-content")) {
        Object.defineProperty(element, "scrollHeight", { configurable: true, value: contentHeight });
      }
      this.callback([{ contentRect: { width: 240 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("design thumbnails", () => {
  it("fits and centers a wide section without cropping its sides", () => {
    act(() => root.render(<DesignThumbnail design={design} theme={{}} />));
    const frame = container.querySelector("iframe")!;
    expect(frame.style.transform).toBe("translate(0px, 37.5px) scale(0.1875)");
    expect(frame.style.height).toBe("400px");
  });

  it("fits a tall section without cropping its bottom", () => {
    contentHeight = 1600;
    act(() => root.render(<DesignThumbnail design={design} theme={{}} />));
    const frame = container.querySelector("iframe")!;
    expect(frame.style.transform).toBe("translate(60px, 0px) scale(0.09375)");
    expect(frame.style.height).toBe("1600px");
  });

  it("keeps the expanded preview full width and height", () => {
    contentHeight = 1600;
    act(() => root.render(<DesignThumbnail design={design} theme={{}} expanded />));
    expect(container.querySelector("iframe")!.style.transform).toBe("translate(0px, 0px) scale(0.1875)");
    expect(container.firstElementChild?.getAttribute("style")).toContain("height: 300px");
  });

  it("uses a padded compact viewport for individual elements", () => {
    act(() => root.render(<DesignThumbnail design={design} theme={{}} compact viewportWidth={480} />));
    const frame = container.querySelector("iframe")!;
    const content = frame.contentDocument!.querySelector<HTMLElement>(".design-thumb-content")!;
    expect(frame.style.width).toBe("480px");
    expect(content.style.minHeight).toBe("300px");
    expect(content.style.padding).toBe("32px");
  });
});
