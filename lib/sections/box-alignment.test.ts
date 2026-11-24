// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { findOffCenterText } from "./box-alignment";

/** A section whose boxes sit where `boxes` says: [left, right] edges by the element's data-box name. */
function layout(markup: string, boxes: Record<string, [number, number]>) {
  const section = document.createElement("section");
  section.innerHTML = markup;
  document.body.append(section);
  for (const element of section.querySelectorAll("[data-box]")) {
    const [left, right] = boxes[element.getAttribute("data-box")!];
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(left, 0, right - left, 40));
  }
  return findOffCenterText(section);
}
const CENTER = 'style="text-align: center"';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("centered text whose box is off-center", () => {
  // The editor wraps rich text in a second box: capped again, it sat at the left of the first.
  const nested = `<div class="rich-text" data-box="outer" ${CENTER}><div data-box="editor" ${CENTER}>
    <div class="rich-text" data-box="inner" ${CENTER}><p data-box="text" ${CENTER}>Centered copy</p><p data-box="text" ${CENTER}>More copy</p></div></div></div>`;

  it("reports a box that is narrower than its container and sits to one side, once", () => {
    expect(layout(nested, { outer: [0, 1000], editor: [0, 1000], inner: [0, 600], text: [0, 600] }))
      .toEqual([{ text: "Centered copy", left: 0, right: 400 }]);
  });

  it("accepts a narrower box that is centered, and a box that fills its container", () => {
    expect(layout(nested, { outer: [0, 1000], editor: [0, 1000], inner: [200, 800], text: [200, 800] })).toEqual([]);
    vi.restoreAllMocks();
    document.body.replaceChildren();
    expect(layout(nested, { outer: [0, 1000], editor: [0, 1000], inner: [0, 1000], text: [0, 1000] })).toEqual([]);
  });

  it("reports a centered heading that hugs its text at the start of a column, and an indented paragraph", () => {
    expect(layout(`<div data-box="stack" style="display: flex; flex-direction: column; text-align: center">
      <h3 data-box="text" ${CENTER}>Plan name</h3></div>`, { stack: [0, 1000], text: [0, 300] }))
      .toEqual([{ text: "Plan name", left: 0, right: 700 }]);
    vi.restoreAllMocks();
    document.body.replaceChildren();
    expect(layout(`<div class="rich-text" data-box="outer" ${CENTER}><p data-box="text" ${CENTER}>Indented</p></div>`,
      { outer: [0, 1000], text: [128, 1000] })).toEqual([{ text: "Indented", left: 128, right: 0 }]);
  });

  it("leaves alone text that is not centered, and boxes placed by the page's layout", () => {
    const boxes = { outer: [0, 1000] as [number, number], text: [0, 300] as [number, number], offset: [200, 1000] as [number, number], fill: [200, 1000] as [number, number] };
    for (const markup of [
      // Left-aligned text in a narrow box.
      `<div class="rich-text" data-box="outer" style="text-align: left"><p data-box="text" style="text-align: left">Left</p></div>`,
      // A grid or a row places its items; a card or badge is an object of its own.
      `<div data-box="outer" style="display: grid; text-align: center"><p data-box="text" ${CENTER}>In a grid</p></div>`,
      `<div data-box="outer" style="display: flex; text-align: center"><p data-box="text" ${CENTER}>In a row</p></div>`,
      `<div data-box="outer" ${CENTER}><p data-box="text" style="text-align: center; background-color: rgb(0, 0, 0)">Badge</p></div>`,
      // An offset column of the design is page layout, not the text's own box.
      `<div data-box="outer" ${CENTER}><div data-box="offset" ${CENTER}><h3 data-box="fill" ${CENTER}>Step</h3></div></div>`,
      // Hidden from sight.
      `<div data-box="outer" ${CENTER}><p class="sr-only" data-box="text" ${CENTER}>For screen readers</p></div>`,
    ]) {
      expect(layout(markup, boxes), markup).toEqual([]);
      vi.restoreAllMocks();
      document.body.replaceChildren();
    }
  });
});
