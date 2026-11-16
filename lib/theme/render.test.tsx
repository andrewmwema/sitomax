import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig } from "../puck/config";
import { RichTextContent } from "@/components/blocks/ui/rich-text";

describe("site font rendering", () => {
  it("renders a stylesheet for only the selected site fonts", () => {
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig,
      data: { root: { props: {} }, content: [] },
      metadata: { theme: { headingFont: "Lora", bodyFont: "Lato" } },
    }));
    expect(html).toContain("family=Lora:wght@400;600;700&amp;family=Lato:wght@400;700&amp;display=swap");
    expect(html).toContain("--font-heading:&quot;Lora&quot;, Georgia, serif");
    expect(html).not.toContain("family=Inter");
  });
  it("loads only curated fonts actually used by sanitized rich text", () => {
    const html = renderToStaticMarkup(createElement(RichTextContent, {
      value: '<p><span style="font-family: &quot;DM Sans&quot;">Hello</span> <span style="font-family: Lora">world</span></p>',
    }));
    expect(html).toContain("family=DM+Sans:wght@400;600;700");
    expect(html).toContain("family=Lora:wght@400;600;700");
    expect(html).not.toContain("family=DM+Serif+Display");
    expect(html).not.toContain("family=Inter");
  });
});
