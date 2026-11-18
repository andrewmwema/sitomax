import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import {
  assertCustomLinks,
  buildCustomSections,
  customPageContract,
  customPlanContract,
} from "./custom-layout";

type ContentItem = { type: string; props: Record<string, unknown> };
type ColumnItem = { props: { content: ContentItem[] } };
type RowItem = { props: { columns: ColumnItem[] } };

const section = {
  background: "default",
  width: "contained",
  rowGap: 48,
  design: { shadow: "soft" },
  rows: [{
    layout: "1-1",
    gap: 32,
    reverseOnMobile: false,
    columns: [
      { surface: "card", verticalAlign: "top", gap: 16, elements: [
        { type: "Heading", text: "Welcome", level: "h1", align: "left" },
        { type: "Text", text: "Local help for your home.", align: "left" },
        { type: "Button", label: "Contact us", href: "/contact", variant: "primary", size: "md", align: "left" },
      ] },
      { surface: "none", verticalAlign: "center", gap: 16, elements: [
        { type: "Image", query: "plumbing tools", alt: "Tools on a workbench", aspect: "4/3",
          fit: "cover", radius: "theme", width: "100", align: "center" },
      ] },
    ],
  }],
};

describe("custom AI layout schemas", () => {
  it("uses the selected pages, explicit style and font direction in the strict wire contract", () => {
    const { tool, schema } = customPlanContract({
      style: "modern", fontDirection: "serif", desiredPages: [""], desiredSections: ["faq"],
    });
    expect(tool.strict).toBe(true);
    // The SDK hoists nested schemas into $defs.
    const definitions = Object.values(("$defs" in tool.input_schema && tool.input_schema.$defs) || {});
    expect(definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ const: "modern" }),
      expect.objectContaining({ properties: expect.objectContaining({
        heading: { enum: expect.arrayContaining(["Lora"]) },
      }) }),
      expect.objectContaining({
        properties: expect.objectContaining({ slug: { enum: [""] } }),
        required: expect.arrayContaining(["slug", "sections", "seo"]),
      }),
    ]));
    const plan = {
      style: "modern", fonts: { heading: "Lora", body: "Inter" },
      colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" },
      pages: [{ slug: "", title: "Home", seo: { title: "Home", description: "An example business." },
        sections: [{ kind: "faq", goal: "What to expect" }, { kind: "footer", goal: "Contact details" }] }],
    };
    expect(schema.safeParse(plan).success).toBe(true);
    expect(schema.safeParse({ ...plan, pages: [plan.pages[0], plan.pages[0]] }).success).toBe(false);
    expect(schema.safeParse({ ...plan, colors: { ...plan.colors, text: "#aaaaaa" } }).success).toBe(false);
  });

  it("builds validated layouts from existing Puck primitives and assigns server IDs", () => {
    const { schema } = customPageContract("");
    const parsed = schema.parse({ slug: "", sections: [section, section] });
    const content = buildCustomSections(parsed.sections, {
      primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111",
    });
    const row = content[0].props.rows as RowItem[];
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("Section");
    expect(content[0].props.id).toMatch(/^Section-/);
    expect(row[0].props.columns[0].props.content[0]).toMatchObject({
      type: "Heading", props: { text: "Welcome", level: "h1" },
    });
    expect(row[0].props.columns[1].props.content[0].props).toMatchObject({
      src: "plumbing tools", alt: "Tools on a workbench",
    });
    expect(new Set(content.map(({ props }) => props.id)).size).toBe(2);
  });

  it("renders a generated layout including its mobile row setting", () => {
    const responsive = structuredClone(section);
    responsive.rows[0].reverseOnMobile = true;
    const { sections } = customPageContract("", 2).schema.parse({ slug: "", sections: [responsive, section] });
    const content = buildCustomSections(sections, {
      primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111",
    });
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig,
      data: { root: { props: {} }, content } as PuckPageData,
      fieldTransforms: { richtext: ({ value }) => value },
    }));
    expect(html).toContain("layout-row layout-row-2 layout-row-reverse");
    expect(html).toContain("<h1");
    expect(html).toContain("Local help for your home.");
    expect(html).toContain('href="/contact"');
  });

  it("reports repairable paths for a wrong section count and an unselected-page link", () => {
    const { schema } = customPageContract("", 3, {
      desiredPages: [""], phone: "", email: "", description: "", designDescription: "",
    });
    const parsed = schema.safeParse({ slug: "", sections: [section, section] });
    expect(parsed.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["sections"], message: expect.stringContaining("exactly 3") }),
      expect.objectContaining({ path: ["sections", 0, "rows", 0, "columns", 0, "elements", 2, "href"] }),
    ]));
  });

  it("rejects unknown component properties, unsupported components and mismatched row presets", () => {
    const { schema } = customPageContract("");
    expect(schema.safeParse({ slug: "", sections: [section, { ...section, arbitraryCode: "alert(1)" }] }).success).toBe(false);
    const invalidElement = { ...section, rows: [{
      ...section.rows[0], columns: [{
        ...section.rows[0].columns[0], elements: [{ type: "Embed", code: "<script/>" }],
      }],
    }] };
    expect(schema.safeParse({ slug: "", sections: [section, invalidElement] }).success).toBe(false);
    expect(schema.safeParse({ slug: "", sections: [section, { ...section, rows: [{ ...section.rows[0], columns: [section.rows[0].columns[0]] }] }] }).success).toBe(false);
  });

  it("accepts only site, anchor, supplied-contact and user-provided external links", () => {
    const { schema } = customPageContract("");
    const parsed = schema.parse({ slug: "", sections: [section, section] });
    expect(() => assertCustomLinks(parsed.sections, {
      desiredPages: ["", "contact"], phone: "+1 555 0100", email: "hello@example.com",
      description: "", designDescription: "",
    })).not.toThrow();
    const unsupported = structuredClone(parsed.sections);
    unsupported[0].rows[0].columns[0].elements[2] = {
      type: "Button", label: "Visit", href: "https://invented.example", variant: "primary", size: "md", align: "left",
    };
    expect(() => assertCustomLinks(unsupported, {
      desiredPages: ["", "contact"], phone: "", email: "", description: "", designDescription: "",
    })).toThrow("not supplied by the business");
  });
});
