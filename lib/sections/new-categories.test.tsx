import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sectionCatalog } from "./catalog";
import { findUnreplacedPlaceholders } from "./placeholders";

describe("additional text, tab and portfolio designs", () => {
  const ids = [
    "text-framed-introduction", "text-editorial-split", "text-accent-statement",
    "tabs-vertical-explorer", "tabs-text-explorer",
    "portfolio-editorial-rows", "portfolio-project-cards", "portfolio-featured-work",
  ];
  it("renders every new design with editable content in both site styles", () => {
    for (const id of ids) {
      const design = sectionCatalog.find((entry) => entry.id === id);
      expect(design, id).toBeDefined();
      const type = design!.blockType as keyof typeof puckConfig.components;
      const data = {
        root: { props: {} },
        content: [{ type, props: { ...puckConfig.components[type].defaultProps, ...design!.props, id } }],
      } as PuckPageData;
      for (const style of ["classic", "modern"]) {
        const html = renderToStaticMarkup(createElement(Render, {
          config: puckConfig, data, metadata: { theme: { style } },
          fieldTransforms: { richtext: ({ value }) => value },
        }));
        expect(html).toContain("section-shell");
        expect(html).toContain(design!.props.heading);
        if (design!.category === "Tabs") {
          expect(html).toContain('role="tablist"');
          expect(html.match(/role="tab"/g)).toHaveLength(3);
          expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
        }
        if (design!.category === "Portfolio") {
          expect(html.match(/<figure/g)).toHaveLength(3);
          expect(html.match(/<figcaption/g)).toHaveLength(3);
          expect(html).toContain('alt="Sample of a light-filled living room"');
        }
      }
    }
  });

  it("renders the twelve requested Step 7 designs and the partner marquee in both styles", () => {
    const newIds = [
      "hero-product-demo", "hero-editorial-centered", "hero-oversized-statement",
      "services-audience-paths", "services-feature-showcase",
      "process-horizontal-visual", "process-vertical-visual",
      "testimonials-trust-bar", "pricing-approach-comparison",
      "portfolio-asymmetric-grid", "portfolio-case-study", "about-report-preview",
      "logos-moving-marquee",
    ];
    expect(new Set(newIds).size).toBe(13);

    for (const id of newIds) {
      const design = sectionCatalog.find((entry) => entry.id === id);
      expect(design, id).toBeDefined();
      const type = design!.blockType as keyof typeof puckConfig.components;
      const data = {
        root: { props: {} },
        content: [{ type, props: { ...puckConfig.components[type].defaultProps, ...design!.props, id } }],
      } as PuckPageData;
      for (const style of ["classic", "modern"]) {
        const html = renderToStaticMarkup(createElement(Render, {
          config: puckConfig,
          data,
          metadata: { theme: { style } },
          fieldTransforms: { richtext: ({ value }) => value },
        }));
        expect(html, id).toContain("section-shell");
        expect(html, id).toContain(design!.props.heading);
        if (id === "testimonials-trust-bar") {
          expect(html).toContain('role="img" aria-label="[4.9]/5 out of 5 stars"');
        }
      }
    }
  });

  it("keeps optional report-preview defaults safe for templates using legacy image-and-text props", () => {
    const data = {
      root: { props: {} },
      content: [{
        type: "ImageWithText",
        props: { ...puckConfig.components.ImageWithText.defaultProps, id: "legacy-image-with-text" },
      }],
    } as PuckPageData;
    expect(findUnreplacedPlaceholders(data)).toEqual([]);
  });

  it("starts the product demo with its built-in interface mockup, not a stock photograph", () => {
    const design = sectionCatalog.find((entry) => entry.id === "hero-product-demo")!;
    expect(design.props.backgroundImage).toBe("");
    const data = {
      root: { props: {} },
      content: [{ type: "Hero", props: { ...puckConfig.components.Hero.defaultProps, ...design.props, id: "product-demo" } }],
    } as PuckPageData;
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig, data,
      fieldTransforms: { richtext: ({ value }) => value },
    }));
    expect(html).toContain("grid-cols-[0.3fr_1fr]");
    expect(html).not.toContain("/samples/kitchen.jpg");
  });
});
