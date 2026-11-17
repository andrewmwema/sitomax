import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { editorConfig } from "@/lib/puck/editor-config";
import { sectionCatalog } from "@/lib/sections/catalog";
import { colorCss, safeHref, snapSpacing, typeSizeStyle } from "./guardrails";
import { blankSection, fitColumns, type LayoutItem } from "./structure";
import { hasUnauthorizedEmbeds } from "./embed";
import { CONVERTIBLE_TYPES, canConvertToLayout, convertToLayout } from "./convert";

type Item = { type: string; props: Record<string, unknown> };

function el(type: string, props: Record<string, unknown> = {}): Item {
  const defaults = puckConfig.components[type as keyof typeof puckConfig.components].defaultProps;
  return { type, props: { ...defaults, ...props, id: `${type}-${Math.random()}` } };
}

function render(content: unknown[]): string {
  return renderToStaticMarkup(
    createElement(Render, {
      config: puckConfig,
      data: { root: { props: {} }, content } as PuckPageData,
      fieldTransforms: { richtext: ({ value }) => value },
    }),
  );
}

/** A blank section whose first column holds the given elements. */
function sectionWith(elements: Item[], layout: Parameters<typeof blankSection>[0] = "1") {
  const section = blankSection(layout);
  const row = (section.props.rows as LayoutItem[])[0];
  const column = (row.props.columns as LayoutItem[])[0];
  column.props.content = elements;
  return section;
}

const defaults = (type: string) =>
  puckConfig.components[type as keyof typeof puckConfig.components]?.defaultProps as
    | Record<string, unknown>
    | undefined;

describe("layout guardrails", () => {
  it("snaps spacing, clamps custom font sizes and only accepts theme or hex colors", () => {
    expect([snapSpacing(10), snapSpacing(100), snapSpacing(999), snapSpacing("x", 16)]).toEqual([
      8, 96, 128, 16,
    ]);
    expect(typeSizeStyle(4, "base").fontSize).toBe("10px");
    expect(typeSizeStyle(200, "base").fontSize).toMatch(/^clamp\(72px, .*, 120px\)$/);
    expect(typeSizeStyle("nope", "lg")).toEqual(typeSizeStyle("lg", "base"));
    expect(colorCss("primary")).toBe("var(--color-primary)");
    expect(colorCss("#AbCdEf")).toBe("#abcdef");
    expect(colorCss("red; background: url(x)", "text")).toBe("var(--color-text)");
    expect(colorCss("auto")).toBeUndefined();
  });

  it("neutralizes unsafe links", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("example.com")).toBe("https://example.com");
    expect(safeHref("/contact")).toBe("/contact");
    expect(safeHref("tel:+15551234")).toBe("tel:+15551234");
  });
});

describe("rows and columns", () => {
  it("keeps the column count in sync with the preset without losing elements", () => {
    const heading = el("Heading") as LayoutItem;
    const text = el("Text") as LayoutItem;
    const three = fitColumns([], "1-1-1");
    expect(three).toHaveLength(3);
    three[1].props.content = [heading];
    three[2].props.content = [text];

    const one = fitColumns(three, "1");
    expect(one).toHaveLength(1);
    expect((one[0].props.content as LayoutItem[]).map((item) => item.type)).toEqual([
      "Heading",
      "Text",
    ]);
    // Already in sync: same array back, so resolveData is a no-op.
    expect(fitColumns(three, "2-1")).toHaveLength(2);
    expect(fitColumns(three, "1-1-1")).toBe(three);
  });

  it("renders sections, ratio rows, columns and elements identically to the editor tree", () => {
    const html = render([
      sectionWith(
        [
          el("Heading", { text: "Built from blocks", level: "h1" }),
          el("Button", { label: "Call", href: "javascript:alert(1)" }),
          el("VerticalSpace", { height: 64, mobileHeight: 16 }),
        ],
        "1-2",
      ),
    ]);
    expect(html).toContain("layout-shell-row");
    expect(html).toContain("--row-cols:minmax(0, 1fr) minmax(0, 2fr)");
    expect(html.match(/layout-shell-column/g)).toHaveLength(2);
    expect(html).toMatch(/<h1[^>]*>Built from blocks<\/h1>/);
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("--spacer-height:64px");
  });
});

describe("embed element", () => {
  it("renders agency code only inside a script-only sandbox", () => {
    const html = render([sectionWith([el("Embed", { code: "<script>alert(document.cookie)</script>" })])]);
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toMatch(/<script>alert/);
  });

  it("lets clients keep, move or remove agency embeds but never add or change code", () => {
    const agency = { type: "Embed", props: { id: "e1", code: "<div>widget</div>", height: "320" } };
    const page = { content: [sectionWith([agency as Item])] };
    const moved = { content: [blankSection(), { ...agency, props: { ...agency.props, height: "640" } }] };
    expect(hasUnauthorizedEmbeds(moved, [page, null])).toBe(false);
    expect(hasUnauthorizedEmbeds({ content: [] }, [page])).toBe(false);
    expect(hasUnauthorizedEmbeds({ content: [{ type: "Embed", props: { code: "" } }] }, [])).toBe(false);

    const changed = { content: [{ ...agency, props: { ...agency.props, code: "<script>x</script>" } }] };
    expect(hasUnauthorizedEmbeds(changed, [page])).toBe(true);
    const crafted = { content: [{ type: "Embed", props: { code: ["<script>x</script>"] } }] };
    expect(hasUnauthorizedEmbeds(crafted, [page])).toBe(true);
  });

  it("is hidden and locked for clients in the editor", () => {
    const client = editorConfig(false);
    expect(client.components.Embed.permissions).toMatchObject({ insert: false, edit: false });
    const visible = Object.values(client.categories ?? {})
      .filter((category) => category.visible !== false)
      .flatMap((category) => category.components ?? []);
    expect(visible).not.toContain("Embed");
    const allow = (client.components.Column.fields?.content as { allow?: string[] }).allow;
    expect(allow).not.toContain("Embed");
    expect(editorConfig(true)).toBe(puckConfig);
  });
});

describe("convert to custom layout", () => {
  it("keeps AI photo attribution and image alt text when converting a designed hero", () => {
    const photoCredits = [{ url: "https://images.unsplash.com/photo-1", alt: "Stock photo of plumbing tools",
      photographer: "Photographer", photographerUrl: "https://unsplash.com/@photographer", sourceUrl: "https://unsplash.com/photos/photo-1" }];
    const converted = convertToLayout(el("Hero", { variant: "split", backgroundImage: photoCredits[0].url,
      backgroundImageAlt: photoCredits[0].alt, photoCredits }), defaults)!;
    expect(converted.props.photoCredits).toEqual(photoCredits);
    expect(converted.props.photoCredits).not.toBe(photoCredits);
    const html = render([converted]);
    expect(html).toContain('alt="Stock photo of plumbing tools"');
    expect(html).toContain('aria-label="Photo credits"');
    expect(html).toContain("Photographer");
  });
  it("converts every designed catalog section into a renderable Section → Row → Column tree", () => {
    expect(canConvertToLayout("Navigation")).toBe(false);
    const types = new Set<string>();
    for (const design of sectionCatalog.filter((entry) => canConvertToLayout(entry.blockType))) {
      types.add(design.blockType);
      const item = { type: design.blockType, props: { ...defaults(design.blockType), ...design.props } };
      const converted = convertToLayout(item, defaults);
      expect(converted?.type, design.id).toBe("Section");
      const { settings, animation, spacing } = design.props.design as Record<string, unknown>;
      expect(converted?.props.design, design.id).toMatchObject({ settings, animation, spacing });

      const rows = converted?.props.rows as LayoutItem[];
      expect(rows.length, design.id).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.type).toBe("Row");
        for (const column of row.props.columns as LayoutItem[]) expect(column.type).toBe("Column");
      }
      const ids = JSON.stringify(converted).match(/"id":"[^"]+"/g) ?? [];
      expect(new Set(ids).size, `${design.id} ids are unique`).toBe(ids.length);

      const html = render([converted]);
      if (typeof design.props.heading === "string" && design.props.heading) {
        expect(html, design.id).toContain(
          design.props.heading.replaceAll("&", "&amp;").replaceAll("'", "&#x27;"),
        );
      }
    }
    expect([...types].sort()).toEqual(
      CONVERTIBLE_TYPES.filter((type) => sectionCatalog.some((d) => d.blockType === type)).sort(),
    );
  });

  it("keeps pricing plans as theme cards and the eyebrow readable on photo heroes", () => {
    const convert = (id: string) => {
      const design = sectionCatalog.find((entry) => entry.id === id)!;
      return convertToLayout(
        { type: design.blockType, props: { ...defaults(design.blockType), ...design.props } },
        defaults,
      )!;
    };

    const pricing = render([convert("pricing-three-cards")]);
    expect(pricing.match(/layout-card site-card/g)?.length).toBe(2);
    expect(pricing.match(/layout-card-highlight/g)?.length).toBe(1);

    const hero = JSON.stringify(convert("hero-overlay-photo"));
    expect(hero).not.toContain('"color":"primary"');
  });
});
