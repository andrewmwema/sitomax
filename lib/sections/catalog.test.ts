import { describe, expect, it } from "vitest";
import { puckConfig } from "@/lib/puck/config";
import { normalizeDesign, type BlockDesign } from "@/lib/sections/design";
import { SECTION_CATEGORIES, sectionCatalog, searchSectionDesigns } from "./catalog";

describe("section catalog", () => {
  it("has unique design ids", () => {
    const ids = sectionCatalog.map((design) => design.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references blocks and categories that exist", () => {
    for (const design of sectionCatalog) {
      expect(puckConfig.components).toHaveProperty(design.blockType);
      expect(SECTION_CATEGORIES).toContain(design.category);
      expect(design.styles.length).toBeGreaterThan(0);
    }
  });

  it("every preset ships a complete SectionShell design object", () => {
    for (const design of sectionCatalog) {
      const shell = design.props.design as BlockDesign | undefined;
      expect(shell, `${design.id} is missing props.design`).toBeDefined();
      expect(shell).toMatchObject({
        settings: { fullBleed: true },
        background: { type: expect.any(String) },
        animation: { trigger: expect.any(String) },
        spacing: expect.any(Object),
      });
      // And it must survive strict normalization without losing shape.
      expect(() => normalizeDesign(shell)).not.toThrow();
    }
  });

  it("every block exposes a variant field so designs can switch layout", () => {
    for (const [type, component] of Object.entries(puckConfig.components)) {
      expect(component.fields, `${type} is missing a variant field`).toHaveProperty(
        "variant",
      );
    }
  });

  it("searches built-in and saved designs across names, blocks and categories", () => {
    const saved = { ...sectionCatalog[0], id: "saved-custom", name: "Seasonal welcome" };
    const designs = [...sectionCatalog, saved];
    expect(searchSectionDesigns(designs, "  HERO seasonal  ")).toEqual([saved]);
    expect(searchSectionDesigns(designs, "contact sidebar").map((entry) => entry.id)).toEqual(["faq-contact-sidebar"]);
    expect(searchSectionDesigns(designs, "no matching section")).toEqual([]);
    expect(searchSectionDesigns(designs, "   ")).toHaveLength(designs.length);
  });
});
