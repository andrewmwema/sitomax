import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { isLayoutOrElementType } from "@/lib/layout/structure";
import { normalizeDesign, type BlockDesign } from "@/lib/sections/design";
import { THEME_PRESETS } from "@/lib/theme/presets";
import { SECTION_CATEGORIES, designsForCategory, sectionCatalog, searchSectionDesigns } from "./catalog";

describe("section catalog", () => {
  it("has unique design ids", () => {
    const ids = sectionCatalog.map((design) => design.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers at least five distinct layouts in each expanded category and three blog layouts", () => {
    for (const category of ["About", "Team", "Stats", "FAQ", "Contact", "Gallery"] as const) {
      const designs = designsForCategory(sectionCatalog, category);
      expect(designs.length, category).toBeGreaterThanOrEqual(5);
      expect(new Set(designs.map((design) => design.props.variant)).size, category).toBeGreaterThanOrEqual(5);
    }
    expect(new Set(designsForCategory(sectionCatalog, "Blog").map((design) => design.props.variant)).size).toBeGreaterThanOrEqual(3);
  });

  it("uses editable sample SVG wordmarks instead of bracketed logo placeholders", () => {
    for (const design of designsForCategory(sectionCatalog, "Logos")) {
      const logos = design.props.logos as { name: string; image: string; imageAlt: string }[];
      expect(logos.length).toBeGreaterThan(0);
      for (const logo of logos) {
        expect(logo.name).not.toMatch(/[\[\]]/);
        expect(logo.image).toMatch(/^\/samples\/partner-[\w-]+\.svg$/);
        expect(logo.imageAlt).toContain("Sample");
      }
    }
  });

  it("only references blocks and categories that exist", () => {
    for (const design of sectionCatalog) {
      expect(puckConfig.components).toHaveProperty(design.blockType);
      expect(SECTION_CATEGORIES).toContain(design.category);
      expect(design.styles.length).toBeGreaterThan(0);
      expect(design.description.trim().length, design.id).toBeGreaterThan(0);
      expect(design.description, design.id).not.toContain("ready-to-customize");
      expect(design.bestFor.length).toBeGreaterThan(0);
      expect(design.metadata.editableFields.length).toBeGreaterThan(0);
    }
  });

  it("every preset ships a complete SectionShell design object", () => {
    for (const design of sectionCatalog) {
      const shell = design.props.design as BlockDesign | undefined;
      expect(shell, `${design.id} is missing props.design`).toBeDefined();
      expect(shell).toMatchObject({
        designVersion: 2,
        visualVersion: 2,
        settings: { fullBleed: true },
        background: { type: expect.any(String) },
        animation: { trigger: expect.any(String) },
        spacing: expect.any(Object),
      });
      // And it must survive strict normalization without losing shape.
      expect(() => normalizeDesign(shell)).not.toThrow();
    }
  });

  it("renders every catalog design with every curated theme preset", () => {
    for (const design of sectionCatalog) {
      const component = puckConfig.components[design.blockType as keyof typeof puckConfig.components];
      const data = {
        root: { props: {} },
        content: [{
          type: design.blockType,
          props: { ...component.defaultProps, ...design.props, id: `theme-test-${design.id}` },
        }],
      } as PuckPageData;
      for (const preset of THEME_PRESETS) {
        const html = renderToStaticMarkup(createElement(Render, {
          config: puckConfig,
          data,
          metadata: { theme: preset.theme },
          fieldTransforms: { richtext: ({ value }) => value },
        }));
        expect(html, `${design.id} / ${preset.id}`).toContain("section-shell");
      }
    }
  }, 20_000);

  it("every designed block exposes a variant field so designs can switch layout", () => {
    for (const [type, component] of Object.entries(puckConfig.components)) {
      // Custom-layout blocks are composed freely instead of using variants.
      if (isLayoutOrElementType(type)) continue;
      const fields = component.fields;
      expect(fields, `${type} is missing a variant field`).toHaveProperty("variant");
      if (!fields || !("variant" in fields)) continue;
      const field = fields.variant;
      if (field.type === "radio" || field.type === "select") {
        const values = field.options.map((option) => option.value);
        expect(new Set(values).size, `${type} has duplicate variant options`).toBe(values.length);
      }
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
