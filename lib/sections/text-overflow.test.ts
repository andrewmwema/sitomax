// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasTextOverflow } from "./text-overflow";

function measure(markup: string, textRect: DOMRect, bounds: DOMRect) {
  const section = document.createElement("section");
  section.innerHTML = markup;
  document.body.append(section);
  for (const element of [section, ...section.querySelectorAll("*")]) {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);
  }
  const original = document.createRange.bind(document);
  vi.spyOn(document, "createRange").mockImplementation(() => {
    const range = original();
    const rects = Object.assign([textRect], { item: (index: number) => index === 0 ? textRect : null });
    Object.defineProperty(range, "getClientRects", { value: () => rects });
    return range;
  });
  return hasTextOverflow(section);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("rendered text overflow", () => {
  const bounds = new DOMRect(0, 0, 100, 40);

  it("reports horizontally overflowing text and clipped vertical text", () => {
    expect(measure("<div>Visible text</div>", new DOMRect(0, 0, 110, 20), bounds)).toBe(true);
    vi.restoreAllMocks();
    document.body.replaceChildren();
    expect(measure('<div style="overflow-y: hidden">Clipped text</div>', new DOMRect(0, 30, 50, 20), bounds)).toBe(true);
  });

  it("ignores text inside the bounds, screen-reader text, and scrollable containers", () => {
    expect(measure("<div>Visible text</div>", new DOMRect(2, 0, 96, 20), bounds)).toBe(false);
    vi.restoreAllMocks();
    document.body.replaceChildren();
    expect(measure('<span class="sr-only">Accessible text</span>', new DOMRect(0, 0, 110, 20), bounds)).toBe(false);
    vi.restoreAllMocks();
    document.body.replaceChildren();
    expect(measure('<div style="overflow-x: auto">Scrollable text</div>', new DOMRect(0, 0, 110, 20), bounds)).toBe(false);
  });
});
