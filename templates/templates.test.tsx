import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sectionCatalog } from "@/lib/sections/catalog";
import { findUnreplacedPlaceholders } from "@/lib/sections/placeholders";
import { plumberTemplate } from "./plumber";
import { salonTemplate } from "./salon";
import { restaurantTemplate } from "./restaurant";
import { generalBusinessTemplate } from "./general-business";
import { instantiateTemplate } from "./instantiate";
import { siteCreationSchema, subdomainSchema } from "@/lib/site-creation";

const templates = [plumberTemplate, salonTemplate, restaurantTemplate, generalBusinessTemplate];

describe("catalog-based website templates", () => {
  it("renders all four pages per template in both styles with navigation, footer and valid local links", () => {
    for (const template of templates) {
      expect(template.pages.map((page) => page.slug)).toEqual(["", "about", "services", "contact"]);
      const ids: string[] = [];
      for (const page of template.pages) {
        expect(page.data.content[0].type).toBe("Navigation");
        expect(page.data.content.at(-1)?.type).toBe("Footer");
        for (const item of page.data.content) {
          ids.push(item.props.id);
          expect(puckConfig.components).toHaveProperty(item.type);
        }
        for (const style of ["classic", "modern"] as const) {
          const html = renderToStaticMarkup(createElement(Render, {
            config: puckConfig, data: page.data as PuckPageData,
            metadata: { theme: { ...template.theme, style } },
            fieldTransforms: { richtext: ({ value }) => value },
          }));
          expect(html).toContain('aria-label="Open menu"');
          expect(html).toContain('aria-label="Main navigation"');
          expect(html).toContain("{{businessName}}");
          for (const link of html.matchAll(/<a\b[^>]*href="(\/[^"]*)"/g)) {
            expect(template.pages.map((entry) => `/${entry.slug}`)).toContain(link[1]);
          }
        }
        expect(findUnreplacedPlaceholders(page.data).length).toBeGreaterThan(0);
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps inserted template sections independent of other pages and catalog presets", () => {
    const home = plumberTemplate.pages[0].data.content.find((item) => item.type === "Services")!;
    const services = plumberTemplate.pages[2].data.content.find((item) => item.type === "Services")!;
    expect(home.props.services).not.toBe(services.props.services);
    const preset = sectionCatalog.find((entry) => entry.id === "services-image-cards")!;
    expect(home.props.design).not.toBe(preset.props.design);
    expect(home.props.design).not.toBe(services.props.design);
  });

  it("instantiates every page without sample claims and safely escapes rich-text values", () => {
    const values = {
      businessName: "Smith & <Co>", phone: "+1 555 123 4567", city: "Oak <Town>",
      services: 'repairs & <script>alert("x")</script>', email: "hello@example.com", address: "42 Main St",
    };
    for (const template of templates) {
      const before = JSON.stringify(template);
      const pages = instantiateTemplate(template, values);
      expect(pages).toHaveLength(4);
      for (const page of pages) {
        expect(findUnreplacedPlaceholders(page.data), `${template.key}/${page.slug}`).toEqual([]);
        const html = renderToStaticMarkup(createElement(Render, {
          config: puckConfig, data: page.data as PuckPageData,
          metadata: { theme: template.theme }, fieldTransforms: { richtext: ({ value }) => value },
        }));
        expect(html).not.toContain("<script>");
        expect(html).toContain("Smith &amp; &lt;Co&gt;");
      }
      expect(JSON.stringify(template)).toBe(before);
    }
  });

  it("validates the subdomain, business input and template choice", () => {
    expect(subdomainSchema.parse(" My-Site ")).toBe("my-site");
    for (const subdomain of ["www", "-name", "a--b", "two.parts", "x".repeat(64)]) {
      expect(subdomainSchema.safeParse(subdomain).success).toBe(false);
    }
    const valid = { accountId: "00000000-0000-4000-8000-000000000001", template: "plumber",
      subdomain: "acme", businessName: "Acme", phone: "+1 555 123 4567", city: "Oak", services: "repairs", email: "a@example.com", address: "42 Main" };
    expect(siteCreationSchema.safeParse(valid).success).toBe(true);
    expect(siteCreationSchema.safeParse({ ...valid, phone: "---" }).success).toBe(false);
    expect(siteCreationSchema.safeParse({ ...valid, template: "unknown" }).success).toBe(false);
  });
});
