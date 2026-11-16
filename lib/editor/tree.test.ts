import { describe, expect, it } from "vitest";
import type { Data } from "@puckeditor/core";
import { blankSection, type LayoutItem } from "@/lib/layout/structure";
import { canPlace, editorTree, insertAt, readClipboard, ROOT_ZONE, selectionPath } from "./tree";

function fixture() {
  const section = blankSection();
  const row = (section.props.rows as LayoutItem[])[0];
  const column = (row.props.columns as LayoutItem[])[0];
  const text = { type: "Text", props: { id: "text-1", text: "<p>Hello</p>" } };
  column.props.content = [text];
  const data: Data = { root: { props: {} }, content: [section] };
  return { data, section, row, column, text };
}
describe("nested editor interactions", () => {
  it("finds the complete selection path and slot selectors", () => {
    const { data, section, row, column } = fixture();
    const entries = editorTree(data);
    expect(selectionPath(entries, "text-1").map((entry) => entry.item.type)).toEqual(["Section", "Row", "Column", "Text"]);
    expect(entries.at(-1)?.selector).toEqual({ index: 0, zone: `${column.props.id}:content` });
    expect(entries[0].selector.zone).toBe(ROOT_ZONE);
    expect(entries[1].parentId).toBe(section.props.id);
    expect(entries[2].parentId).toBe(row.props.id);
  });
  it("inserts into a nested slot without mutating the page or changing sibling content", () => {
    const { data, column } = fixture();
    const inserted = { type: "Heading", props: { id: "heading-1", text: "Next" } };
    const next = insertAt(data, `${column.props.id}:content`, 1, inserted);
    expect(editorTree(next).map((entry) => entry.item.type)).toEqual(["Section", "Row", "Column", "Text", "Heading"]);
    expect(editorTree(data)).toHaveLength(4);
    expect(() => insertAt(data, "missing:content", 0, inserted)).toThrow("destination");
    expect(canPlace("Heading", "Column", "content")).toBe(true);
    expect(canPlace("Heading")).toBe(false);
    expect(canPlace("Row", "Column", "content")).toBe(false);
    expect(canPlace("Row", "Section", "rows")).toBe(true);
  });
  it("rejects cross-account, cross-user and nested Embed clipboard payloads for clients", () => {
    const { section } = fixture();
    const raw = JSON.stringify({ accountId: "a1", userId: "u1", item: section });
    expect(readClipboard(raw, "a1", "u1", false)).toEqual(section);
    expect(() => readClipboard(raw, "a2", "u1", false)).toThrow();
    expect(() => readClipboard(raw, "a1", "u2", false)).toThrow();
    const column = ((section.props.rows as LayoutItem[])[0].props.columns as LayoutItem[])[0];
    column.props.content = [{ type: "Embed", props: { id: "e1", code: "<script>x()</script>" } }];
    const embed = JSON.stringify({ accountId: "a1", userId: "u1", item: section });
    expect(() => readClipboard(embed, "a1", "u1", false)).toThrow("agency");
    expect(readClipboard(embed, "a1", "u1", true)).toEqual(section);
  });
});
