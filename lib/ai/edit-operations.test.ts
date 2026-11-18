import { describe, expect, it } from "vitest";
import type { Data } from "@puckeditor/core";
import { sectionCatalog } from "@/lib/sections/catalog";
import { contrastRatio } from "@/lib/theme/presets";
import { designPatchSchema, editDesign, editTheme, readableText, themePatchSchema } from "./edit-design";
import { applyEditOperations, sectionContext, updateEditableProps } from "./edit-operations";

const page: Data = { root: { props: { title: "Home" } }, content: [
  { type: "Hero", props: { id: "hero", heading: "Our work", backgroundImage: "/samples/tools.jpg" } },
  { type: "Footer", props: { id: "footer", businessName: "Example", email: "hello@example.com" } },
] };
const allowed = (url: string) => url === "/samples/tools.jpg";

describe("editor AI operations", () => {
  it("accepts only configured fields and layout choices; rejects markup, unsafe links, and factual fields", () => {
    expect(updateEditableProps("Footer", { businessName: "Example" }, { variant: "compact" })).toEqual({ businessName: "Example", variant: "compact" });
    for (const patch of [{ unknown: "x" }, { variant: "diagonal" }, { tagline: "<script>x</script>" }, { email: "fake@example.com" }, { navigation: [{ href: "/\\invalid.example" }] }]) {
      expect(() => updateEditableProps("Footer", {}, patch)).toThrow();
    }
    expect(() => updateEditableProps("Testimonials", {}, { testimonials: [] })).toThrow();
    expect(updateEditableProps("TextSection", {}, { text: "A & B\n\nNext line" }).text).toBe("<p>A &amp; B</p><p>Next line</p>");
  });

  it("keeps context and operation targets scoped, and omits protected embed code", () => {
    const withEmbed = { ...page, content: [...page.content, { type: "Embed", props: { id: "embed", code: "<secret>" } }] };
    expect(sectionContext(withEmbed, "section", "hero").map(({ id }) => id)).toEqual(["hero"]);
    expect(sectionContext(withEmbed, "theme")).toEqual([]);
    expect(JSON.stringify(sectionContext(withEmbed, "page"))).not.toContain("<secret>");
    expect(() => applyEditOperations(page, {}, "section", "hero", [{ name: "delete_section", input: { sectionId: "footer" } }], allowed)).toThrow("outside your scope");
    expect(() => applyEditOperations(withEmbed, {}, "page", undefined, [{ name: "duplicate_section", input: { sectionId: "embed" } }], allowed)).toThrow();
    expect(() => applyEditOperations(page, {}, "theme", undefined, [{ name: "delete_section", input: { sectionId: "footer" } }], allowed)).toThrow();
  });

  it("switches within the block type, preserves content and reports deletions without mutating the draft", () => {
    const hero = sectionCatalog.find((design) => design.blockType === "Hero" && design.props.design)!;
    const result = applyEditOperations(page, {}, "page", undefined, [
      { name: "switch_section_design", input: { sectionId: "hero", designId: hero.id } },
      { name: "delete_section", input: { sectionId: "footer" } },
    ], allowed);
    expect(result.data.content[0].props).toMatchObject({ heading: "Our work", designId: hero.id, backgroundImage: "/samples/tools.jpg" });
    expect(result.deleted).toEqual(["Footer"]);
    expect(page.content).toHaveLength(2);
    expect(() => applyEditOperations(page, {}, "page", undefined, [
      { name: "switch_section_design", input: { sectionId: "footer", designId: hero.id } },
    ], allowed)).toThrow("same block type");
  });

  it("rejects unapproved assets, fonts, colors, and unsupported design values", () => {
    expect(designPatchSchema.safeParse({ background: { type: "video", video: { source: "url", embedUrl: "https://example.com/watch?v=abc" } } }).success).toBe(false);
    expect(designPatchSchema.safeParse({ spacing: { mobile: { paddingTop: 999 } }, shadow: "0 0 0" }).success).toBe(false);
    expect(themePatchSchema.safeParse({ headingFont: "Unknown", colors: { accent: "green" } }).success).toBe(false);
    expect(() => applyEditOperations(page, {}, "section", "hero", [
      { name: "update_section_design", input: { sectionId: "hero", patch: { background: { type: "image", images: ["/samples/unseen.jpg"] } } } },
    ], allowed)).toThrow("already present");
  });
});

describe("editor AI contrast", () => {
  it("preserves readable colors and picks an AA alternative for every grayscale backdrop", () => {
    expect(readableText("#123", "#fff")).toBe("#123");
    for (let value = 0; value < 256; value++) {
      const background = `#${value.toString(16).padStart(2, "0").repeat(3)}`;
      expect(contrastRatio(readableText(background, background), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("adjusts theme colors and responsive section overrides, preserving other device spacing", () => {
    const warnings = new Set<string>();
    const theme = editTheme({}, { colors: { background: "#fff", text: "#eee" } }, warnings);
    expect(contrastRatio(theme.colors!.text!, "#fff")).toBeGreaterThanOrEqual(4.5);
    const design = editDesign({ spacing: { tablet: { marginTop: 20 } } }, { spacing: { mobile: { paddingTop: 32 } },
      background: { type: "color", color: "#222" }, appearance: { mobile: { textColor: "#333" } } }, theme, warnings);
    expect(contrastRatio(design.appearance!.mobile!.textColor!, "#222")).toBeGreaterThanOrEqual(4.5);
    expect(design.spacing).toEqual({ tablet: { marginTop: 20 }, mobile: { paddingTop: 32 } });
    expect(warnings.size).toBe(2);
  });
});
