import { describe, expect, it } from "vitest";
import {
  assertCustomLinks,
  buildCustomSections,
  customPageContract,
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
