import { describe, expect, it } from "vitest";
import { alignmentProblemSummary, findAlignmentProblems } from "./alignment-qa";

type Props = Record<string, unknown>;
const element = (type: string, id: string, props: Props = {}) => ({ type, props: { id, text: type === "Heading" ? "Our services" : "<p>What we do.</p>", ...props } });
/** A custom section of rows, each a list of columns given as [column props, elements]. */
function section(rows: [Props, ReturnType<typeof element>[]][][], props: Props = {}) {
  return { type: "Section", props: { id: "section", ...props, rows: rows.map((columns, row) => ({ type: "Row", props: {
    id: `row-${row}`, columns: columns.map(([column, content], index) => ({ type: "Column", props: { id: `column-${row}-${index}`, ...column, content } })),
  } })) } };
}
const spacing = (device: string, box: Props) => ({ spacing: { [device]: box } });

describe("saved settings that push centered text off-center", () => {
  it("reports unequal left and right spacing on a centered element, on the devices it applies to", () => {
    const problems = findAlignmentProblems(section([[[{}, [
      element("Heading", "heading", { align: "center" }),
      element("Text", "text", { align: "center", design: spacing("desktop", { marginLeft: 128 }) }),
    ]]]]));
    // Tablet and mobile inherit desktop spacing, as the stylesheet does.
    expect(problems).toEqual([{ id: "text", type: "Text", cause: "spacing", text: "What we do.", devices: ["desktop", "tablet", "mobile"], left: 128, right: 0 }]);
    expect(alignmentProblemSummary(problems[0])).toContain("128px of margin and padding on its left and 0px on its right");
  });

  it("follows per-device spacing and alignment overrides", () => {
    const design = { spacing: { desktop: { paddingLeft: 64, paddingRight: 64 }, mobile: { paddingRight: 0 } } };
    expect(findAlignmentProblems(section([[[{}, [element("Text", "text", { align: "center", design })]]]])))
      .toMatchObject([{ id: "text", devices: ["mobile"], left: 64, right: 0 }]);
    // Left-aligned on mobile, where the spacing differs: nothing is centered there.
    const leftOnMobile = { ...design, appearance: { mobile: { align: "left" } } };
    expect(findAlignmentProblems(section([[[{}, [element("Text", "text", { align: "center", design: leftOnMobile })]]]]))).toEqual([]);
  });

  it("takes alignment from the container when the element has none, and from the section over everything", () => {
    const lopsided = spacing("desktop", { marginLeft: 96 });
    const column = { design: { appearance: { desktop: { align: "center" } } } };
    expect(findAlignmentProblems(section([[[column, [element("Text", "text", { design: lopsided })]]]]))).toHaveLength(1);
    expect(findAlignmentProblems(section([[[column, [element("Text", "text", { align: "left", design: lopsided })]]]]))).toEqual([]);
    const forced = { design: { appearance: { desktop: { align: "center" } } } };
    expect(findAlignmentProblems(section([[[{}, [element("Text", "text", { align: "left", design: lopsided })]]]], forced))).toHaveLength(1);
  });

  it("reports a lopsided column only where it is the whole row, and passes equal or small differences", () => {
    const lopsided = { design: spacing("desktop", { paddingLeft: 96 }) };
    const centered = [element("Heading", "heading", { align: "center" })];
    expect(findAlignmentProblems(section([[[lopsided, centered]]]))).toMatchObject([{ id: "column-0-0", type: "Column", text: "Our services" }]);
    // Beside another column, its padding is part of the row's layout.
    expect(findAlignmentProblems(section([[[lopsided, centered], [{}, []]]]))).toEqual([]);
    const even = { design: spacing("desktop", { paddingLeft: 96, paddingRight: 96 }) };
    const slight = { design: spacing("desktop", { paddingLeft: 8 }) };
    expect(findAlignmentProblems(section([[[even, centered]], [[slight, centered]]]))).toEqual([]);
    // Nothing centered: uneven spacing is a design choice.
    expect(findAlignmentProblems(section([[[lopsided, [element("Heading", "heading", { align: "left" })]]]]))).toEqual([]);
  });

  it("reports an indent on a centered paragraph and lopsided spacing on a centered designed block", () => {
    expect(findAlignmentProblems(section([[[{}, [
      element("Text", "text", { align: "center", text: '<p style="margin-left: 128px">Indented</p>' }),
    ]]]]))).toMatchObject([{ id: "text", cause: "indent", text: "Indented" }]);
    const block = { type: "TextSection", props: { id: "about", heading: "About us", design: {
      appearance: { desktop: { align: "center" } }, spacing: { desktop: { paddingLeft: 128 } },
    } } };
    expect(findAlignmentProblems(block)).toMatchObject([{ id: "about", cause: "spacing", left: 128, right: 0 }]);
    expect(findAlignmentProblems({ ...block, props: { ...block.props, design: { spacing: { desktop: { paddingLeft: 128 } } } } })).toEqual([]);
  });
});
