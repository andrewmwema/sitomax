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
});
