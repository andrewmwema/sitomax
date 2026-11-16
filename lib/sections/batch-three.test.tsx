import { existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { sectionCatalog } from "./catalog";
import { findUnreplacedPlaceholders } from "./placeholders";

const designs = sectionCatalog.filter((design) => design.category === "Pricing" || design.category === "FAQ");

function dataFor(type: "Pricing" | "Faq", props: Record<string, unknown>): PuckPageData {
  return {
    root: { props: {} },
    content: [{ type, props: { ...puckConfig.components[type].defaultProps, ...props, id: "batch-three-test" } }],
  } as PuckPageData;
}

function render(data: PuckPageData, style = "classic") {
  return renderToStaticMarkup(createElement(Render, {
    config: puckConfig,
    data,
    metadata: { theme: { style } },
    fieldTransforms: { richtext: ({ value }) => value },
  }));
}

describe("Batch 3 designs", () => {
  it("renders seven layouts in both styles with complete shell controls and sample assets", () => {
    expect(designs.filter((design) => design.category === "Pricing")).toHaveLength(4);
    expect(designs.filter((design) => design.category === "FAQ")).toHaveLength(3);
    expect(new Set(designs.map((design) => `${design.blockType}:${design.props.variant}`)).size).toBe(7);
    for (const design of designs) {
      for (const style of ["classic", "modern"]) {
        const html = render(dataFor(design.blockType as "Pricing" | "Faq", design.props), style);
        expect(html, design.id).toContain("section-shell");
        expect(html, design.id).toContain(design.props.heading);
        for (const image of html.matchAll(/src="(\/samples\/[^"]+)"/g)) {
          expect(existsSync(path.join(process.cwd(), "public", image[1])), image[1]).toBe(true);
        }
      }
    }
  });

  it("leaves all example prices bracketed and warns about inactive yearly prices too", () => {
    for (const design of designs.filter((entry) => entry.blockType === "Pricing")) {
      const plans = design.props.plans as { price: string; yearlyPrice: string }[];
      for (const plan of plans) {
        for (const price of [plan.price, plan.yearlyPrice]) {
          if (price && price !== "Custom") expect(price, design.id).toMatch(/^\$\[[\d,.]+\]$/);
        }
      }
      expect(findUnreplacedPlaceholders(dataFor("Pricing", design.props))).toHaveLength(1);
    }
    expect(findUnreplacedPlaceholders(dataFor("Pricing", {
      plans: [{ name: "Care", price: "$29", period: "per month", yearlyPrice: "$[290]", features: "Advice", buttonText: "", buttonLink: "", highlighted: false }],
    }))[0].snippets).toContain("[290]");
  });

  it("builds comparison rows from exact, trimmed feature names, with accessible inclusion states", () => {
    const plan = { name: "Essential", price: "$[29]", period: "per month", features: " Guidance \nWritten notes\n\nGuidance", buttonText: "", buttonLink: "", highlighted: false };
    const html = render(dataFor("Pricing", {
      variant: "comparison",
      plans: [plan, { ...plan, name: "Complete", features: "Guidance\nWritten notes\nProject review" }],
    }));
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table.match(/scope="row"/g)).toHaveLength(3);
    expect(table).toContain("Not included");
    expect(table).toContain("Included");
    expect(table).toContain("<caption");
    expect(table.match(/scope="col"/g)).toHaveLength(3);
  });

  it("shows the highlighted single plan without discarding other plans or changing the input", () => {
    const preset = designs.find((design) => design.id === "pricing-three-cards")!;
    const data = dataFor("Pricing", { ...preset.props, variant: "single" });
    const before = JSON.stringify(data);
    const html = render(data);
    expect(html).toContain("A fresh start");
    expect(html).toContain("$[499]");
    expect(html).not.toContain("Something bigger");
    expect(JSON.stringify(data)).toBe(before);
    const cards = render(dataFor("Pricing", { ...preset.props, variant: "cards" }));
    expect(cards).toContain("Something bigger");
  });

  it("retains legacy simple pricing and initially closed FAQ answers", () => {
    const html = render(dataFor("Pricing", {
      variant: "simple",
      plans: [{ name: "Original plan", price: "$79", period: "per visit", features: "Original benefit", buttonText: "Book a visit", buttonLink: "/contact", highlighted: true }],
    }));
    expect(html).toContain("Original plan");
    expect(html).toContain("$79");
    expect(html).toContain("Original benefit");
    const faq = render(dataFor("Faq", {
      items: [{ question: "Existing question?", answer: "<p>Existing answer.</p>" }],
    }));
    expect(faq).toContain("Existing answer.");
    expect(faq).not.toMatch(/<details[^>]*open/);
  });

  it("sanitizes pricing descriptions and FAQ sidebar copy using the existing rich-text fields", () => {
    const pricing = sanitizePuckData(dataFor("Pricing", {
      text: '<p onclick="alert(1)">Introduction</p>',
      note: "<p>Pricing note</p><script>alert(1)</script>",
      plans: [{ name: "Care", price: "$[29]", period: "per month", features: "Advice", description: '<p onmouseover="alert(1)">Plan description</p>', buttonText: "", buttonLink: "", highlighted: false }],
    }));
    const faq = sanitizePuckData(dataFor("Faq", {
      contactText: '<p onclick="alert(1)">Sidebar copy</p>',
      items: [{ question: "Question", answer: "<p>Answer</p><script>alert(1)</script>" }],
    }));
    const clean = JSON.stringify([pricing, faq]);
    expect(clean).toContain("Plan description");
    expect(clean).toContain("Sidebar copy");
    expect(clean).not.toMatch(/onclick|onmouseover|<script>/);
  });
});
