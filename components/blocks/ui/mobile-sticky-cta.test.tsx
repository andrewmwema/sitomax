import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileStickyCTA, hasMobileStickyCta } from "./mobile-sticky-cta";

describe("mobile sticky CTA", () => {
  it("renders nothing unless enabled with a label and destination", () => {
    expect(renderToStaticMarkup(createElement(MobileStickyCTA, {}))).toBe("");
    expect(renderToStaticMarkup(createElement(MobileStickyCTA, {
      settings: { enabled: false, label: "Call us", href: "tel:+15551234567" },
    }))).toBe("");
    expect(hasMobileStickyCta({ enabled: true, label: " ", href: "/contact" })).toBe(false);
  });

  it("renders the configured action through the shared button component", () => {
    const html = renderToStaticMarkup(createElement(MobileStickyCTA, {
      settings: { enabled: true, label: "Get a quote", href: "/contact" },
    }));
    expect(html).toContain('class="mobile-sticky-cta"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain("Get a quote");
    expect(html).toContain('data-analytics-event="cta_click"');
  });
});
