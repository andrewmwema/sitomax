import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sectionCatalog } from "./catalog";

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
});
