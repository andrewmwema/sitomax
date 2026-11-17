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

const designs = sectionCatalog.filter((design) =>
  (design.blockType === "Services" && design.category === "Services") || design.blockType === "Stats",
);

function dataFor(blockType: string, props: Record<string, unknown>): PuckPageData {
  const component = puckConfig.components[blockType as keyof typeof puckConfig.components];
  return {
    root: { props: {} },
    content: [{ type: blockType, props: { ...component.defaultProps, ...props, id: "batch-two-test" } }],
  } as PuckPageData;
}

describe("Batch 2 designs", () => {
  it("renders all nine distinct layouts in both styles with complete sample assets", () => {
    expect(designs.filter((design) => design.blockType === "Services")).toHaveLength(6);
    expect(designs.filter((design) => design.category === "Stats")).toHaveLength(3);
    expect(new Set(designs.map((design) => `${design.blockType}:${design.props.variant}`)).size).toBe(9);

    for (const design of designs) {
      for (const style of ["classic", "modern"]) {
        const html = renderToStaticMarkup(createElement(Render, {
          config: puckConfig,
          data: dataFor(design.blockType, design.props),
          metadata: { theme: { style } },
          fieldTransforms: { richtext: ({ value }) => value },
        }));
        expect(html, design.id).toContain("section-shell");
        expect(html, design.id).toContain(design.props.heading);
        for (const image of html.matchAll(/src="(\/samples\/[^"]+)"/g)) {
          expect(existsSync(path.join(process.cwd(), "public", image[1])), image[1]).toBe(true);
        }
      }
    }
  });

  it("keeps every statistical claim bracketed and visible to the publish warning", () => {
    for (const design of designs.filter((entry) => entry.blockType === "Stats")) {
      const data = dataFor(design.blockType, design.props);
      const stats = design.props.stats as { value: string; detail: string }[];
      for (const stat of stats) {
        expect(stat.value, design.id).toMatch(/^\[[\d,.]+\](?:\+|\/5)?$/);
        // Any additional numerical claim in supporting copy is a placeholder too.
        expect(stat.detail.replace(/\[[^\]]+\]/g, "")).not.toMatch(/\d/);
      }
      expect(findUnreplacedPlaceholders(data)).toEqual([
        expect.objectContaining({ index: 0, blockType: "Stats" }),
      ]);
    }
  });

  it("renders legacy service data without losing its copy or requiring new fields", () => {
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig,
      data: dataFor("Services", {
        eyebrow: "Existing services",
        heading: "Our original offering",
        variant: "grid",
        services: [{ icon: "wrench", title: "Existing repair", text: "<p>Existing description</p>" }],
      }),
      fieldTransforms: { richtext: ({ value }) => value },
    }));
    expect(html).toContain("Existing repair");
    expect(html).toContain("Existing description");
    expect(html).not.toContain("<img");
  });

  it("sanitizes the new introduction and service descriptions before saving", () => {
    const dirty = dataFor("Services", {
      text: '<p onclick="alert(1)">Introduction</p>',
      services: [{ icon: "wrench", title: "Service", text: '<p>Detail</p><script>alert(1)</script>' }],
    });
    const clean = JSON.stringify(sanitizePuckData(dirty));
    expect(clean).toContain("Introduction");
    expect(clean).toContain("Detail");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<script>");
  });

  it("links tab controls to unique, initially hidden panels across multiple sections", () => {
    const tabDesign = designs.find((design) => design.id === "services-tabs")!;
    const data = dataFor("Services", tabDesign.props);
    const second = dataFor("Services", tabDesign.props).content[0];
    second.props.id = "second-tabs";
    data.content.push(second);
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig,
      data,
      fieldTransforms: { richtext: ({ value }) => value },
    }));
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    const tabIds = ids.filter((id) => id.includes("-tab-") || id.includes("-panel-"));
    expect(new Set(tabIds).size).toBe(12);
    expect(html.match(/role="tab" aria-selected="true"/g)).toHaveLength(2);
    expect(html.match(/hidden=""/g)).toHaveLength(4);
    for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) {
      expect(ids).toContain(match[1]);
    }
  });
});
