import { expect, it } from "vitest";
import { buildDesignItem } from "./library";
import { sectionCatalog, designsForCategory, searchSectionDesigns, sectionCategory, type SectionDesign } from "./catalog";
import { blankSection } from "@/lib/layout/structure";

it("re-keys saved slot trees on every insert without modifying their content or the saved design", () => {
  const layout = blankSection("1-2");
  const design: SectionDesign = {
    id: "saved-layout", name: "Custom columns", blockType: "Section",
    category: "Text blocks", thumbnail: null, styles: ["classic", "modern"], props: layout.props,
  };
  const original = JSON.stringify(design);
  const first = buildDesignItem(design);
  const second = buildDesignItem(design);
  const ids = (item: unknown) => [...JSON.stringify(item).matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
  expect(ids(first)).toHaveLength(4);
  expect(new Set([...ids(layout), ...ids(first), ...ids(second)]).size).toBe(12);
  expect(JSON.stringify(design)).toBe(original);
  expect(first.props).toMatchObject({ background: "default", rows: [{ type: "Row", props: { layout: "1-2" } }] });
});

it("keeps legacy saved categories available and exposes image-and-text designs in their dedicated category", () => {
  expect(sectionCategory("Features/Services")).toBe("Services");
  expect(sectionCategory("Text")).toBe("Text blocks");
  expect(sectionCategory("Process")).toBe("Services");
  expect(sectionCategory("unknown")).toBeNull();
  expect(designsForCategory(sectionCatalog, "Text & Image")).toHaveLength(3);
});

it("finds and inserts the blog feed from the library's category and search", () => {
  const [preset] = designsForCategory(sectionCatalog, "Blog");
  expect(preset).toBeDefined();
  expect(searchSectionDesigns(sectionCatalog, "blog posts")).toContain(preset);
  expect(buildDesignItem(preset)).toMatchObject({
    type: "BlogPosts",
    props: { source: "latest", variant: "grid", showViewAll: true },
  });
});
