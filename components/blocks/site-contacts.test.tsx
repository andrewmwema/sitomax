import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { emptyBusiness } from "@/lib/business";

const contacts = { ...emptyBusiness, businessName: "Example Studio", phone: "+1 555 0100",
  email: "hello@example.test", address: "Long street address", openingHours: "By appointment",
  socialLinks: [{ label: "Our photos", url: "https://instagram.com/example" }] };

function render(type: "Footer" | "ContactForm", props: Record<string, unknown>, metadata = true, business = contacts) {
  return renderToStaticMarkup(createElement(Render, {
    config: puckConfig,
    data: { root: { props: {} }, content: [{
      type, props: { ...puckConfig.components[type].defaultProps, ...props, id: "test-block" },
    }] } as PuckPageData,
    metadata: metadata ? { siteMenu: { contacts: business, links: [{ label: "About", href: "/about" }] } } : {},
    fieldTransforms: { richtext: ({ value }) => value },
  }));
}

describe("shared business contact rendering", () => {
  it.each(["split", "visit"])("renders one set of contact details next to the %s form", (variant) => {
    const html = render("ContactForm", { variant, image: "" });
    expect(html.match(/hello@example\.test<\/a>/g)).toHaveLength(1);
    expect(html.match(/Long street address/g)).toHaveLength(1);
    expect(html.match(/<dl\b/g)).toHaveLength(1);
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });

  it.each(["columns", "centered", "compact"])("uses saved business contacts, menus and socials in a %s footer", (variant) => {
    const html = render("Footer", { variant, businessName: "Stale name",
      socialLinks: [{ platform: "facebook", url: "https://facebook.com/stale" }] });
    expect(html).toContain("Example Studio");
    expect(html).not.toMatch(/Stale name|facebook\.com\/stale/);
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="https://instagram.com/example"');
    expect(html).toContain("Our photos");
  });

  it("keeps block social links when no site metadata is available", () => {
    expect(render("Footer", { socialLinks: [{ platform: "facebook", url: "https://facebook.com/example" }] }, false))
      .toContain('href="https://facebook.com/example"');
  });
  it("normalizes bare profile URLs accepted by Business information", () => {
    expect(render("Footer", {}, true, { ...contacts, socialLinks: [{ label: "Photos", url: "instagram.com/example" }] }))
      .toContain('href="https://instagram.com/example"');
  });
});
