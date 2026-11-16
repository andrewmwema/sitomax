import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sectionCatalog } from "@/lib/sections/catalog";

describe("pricing surfaces", () => {
  it.each(["pricing-three-cards", "pricing-billing-toggle"])(
    "%s keeps every plan distinct from its section, including the highlighted plan",
    (id) => {
      const design = sectionCatalog.find((entry) => entry.id === id)!;
      const data = {
        root: { props: {} },
        content: [{ type: design.blockType, props: { ...design.props, id } }],
      } as PuckPageData;
      const html = renderToStaticMarkup(createElement(Render, {
        config: puckConfig,
        data,
        fieldTransforms: { richtext: ({ value }) => value },
      }));
      const sectionStyle = html.match(/<section\b[^>]*style="([^"]*)"/)?.[1];
      const sectionBackground = sectionStyle?.match(/background-color:([^;"]*)/)?.[1];
      const cardStyles = [...html.matchAll(/class="site-card [^"]*" style="([^"]*)"/g)]
        .map((match) => match[1]);

      expect(sectionBackground).toBeDefined();
      expect(cardStyles.length).toBeGreaterThanOrEqual(3);
      for (const style of cardStyles) {
        const background = style.match(/background-color:([^;"]*)/)?.[1];
        expect(background).toBeDefined();
        expect(sectionBackground).not.toContain(background);
      }
      expect(cardStyles.some((style) =>
        style.includes("border-color:var(--color-primary)") && style.includes("border-width:2px"),
      )).toBe(true);
    },
  );
});
