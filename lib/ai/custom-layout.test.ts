import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import {
  assertCustomLinks,
  buildCustomSections,
  customSectionSchema,
  customSiteSectionContract,
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
    expect(tool.input_schema).toMatchObject({ properties: {
      style: { const: "modern" },
      fonts: { properties: { heading: { enum: expect.arrayContaining(["Lora"]) } } },
      pages: { required: ["home"], additionalProperties: false },
    } });
    const plan = {
      style: "modern", fonts: { heading: "Lora", body: "Inter" },
      colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" },
      pages: { home: { title: "Home", seo: { title: "Home", description: "An example business." },
        sections: [{ kind: "faq", goal: "What to expect" }, { kind: "footer", goal: "Contact details" }] } },
    };
    expect(schema.safeParse(plan).success).toBe(true);
    expect(schema.safeParse({ ...plan, pages: {} }).success).toBe(false);
    const normalized = schema.parse({ ...plan, colors: { ...plan.colors, text: "#aaaaaa" }, pages: {
      home: { ...plan.pages.home, sections: [], title: "x".repeat(90) }, about: plan.pages.home,
    } });
    expect(normalized.colors.text).toBe("#767676");
    expect(normalized.contrastAdjusted).toBe(true);
    expect(normalized.pages.map(({ slug }) => slug)).toEqual([""]);
    expect(normalized.pages[0].title).toHaveLength(80);
    expect(normalized.pages[0].sections.map(({ kind }) => kind)).toEqual(["hero", "faq", "footer"]);
  });

  it("builds validated layouts from existing Puck primitives and assigns server IDs", () => {
    const content = buildCustomSections([customSectionSchema.parse(section), customSectionSchema.parse(section)], {
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
    const content = buildCustomSections([customSectionSchema.parse(responsive)], {
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

  it("reports a repairable path for an unselected-page link", () => {
    const { schema } = customSiteSectionContract({
      desiredPages: [""], phone: "", email: "", description: "", designDescription: "",
    });
    const parsed = schema.safeParse({ section });
    expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: ["section", "rows", 0, "columns", 0, "elements", 2, "href"] })]);
  });

  it("rejects unknown component properties, unsupported components and mismatched row presets", () => {
    const schema = customSectionSchema;
    expect(schema.safeParse({ ...section, arbitraryCode: "alert(1)" }).success).toBe(false);
    const invalidElement = { ...section, rows: [{
      ...section.rows[0], columns: [{
        ...section.rows[0].columns[0], elements: [{ type: "Embed", code: "<script/>" }],
      }],
    }] };
    expect(schema.safeParse(invalidElement).success).toBe(false);
    expect(schema.safeParse({ ...section, rows: [{ ...section.rows[0], columns: [section.rows[0].columns[0]] }] }).success).toBe(false);
  });

  it("defaults optional presentation fields and enforces 60 elements per section", () => {
    const row = { ...section.rows[0], reverseOnMobile: undefined };
    const heading = { type: "Heading", text: "Hello", level: "h2" };
    const col = (count: number) => ({ ...row.columns[0], elements: Array(count).fill(heading) });
    const fullRow = { ...row, layout: "1-1-1-1", columns: [col(8), col(8), col(8), col(8)] };
    const valid = customSectionSchema.parse({ ...section, design: undefined, rows: [fullRow, { ...fullRow, columns: [col(8), col(8), col(8), col(4)] }] });
    expect(valid.design).toEqual({});
    expect(valid.rows[0]).toMatchObject({ reverseOnMobile: false, columns: [{ elements: Array(8).fill({ ...heading, align: "left" }) }, ...valid.rows[0].columns.slice(1)] });
    expect(customSectionSchema.safeParse({ ...section, rows: [fullRow, { ...fullRow, columns: [col(8), col(8), col(8), col(5)] }] }).error?.issues)
      .toEqual([expect.objectContaining({ path: ["rows"], message: expect.stringContaining("60 elements") })]);
  });

  it("accepts only site, anchor, supplied-contact and user-provided external links", () => {
    const parsed = [customSectionSchema.parse(section)];
    expect(() => assertCustomLinks(parsed, {
      desiredPages: ["", "contact"], phone: "+1 555 0100", email: "hello@example.com",
      description: "", designDescription: "",
    })).not.toThrow();
    const unsupported = structuredClone(parsed);
    unsupported[0].rows[0].columns[0].elements[2] = {
      type: "Button", label: "Visit", href: "https://invented.example", variant: "primary", size: "md", align: "left",
    };
    expect(() => assertCustomLinks(unsupported, {
      desiredPages: ["", "contact"], phone: "", email: "", description: "", designDescription: "",
    })).toThrow("not supplied by the business");
  });
});
