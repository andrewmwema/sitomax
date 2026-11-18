import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { menuLabelSchema, pageMenuLinks, siteContacts } from "./page-navigation";

describe("tenant navigation", () => {
  it("uses short labels independently of titles and validates the editor word limit", () => {
    const pages = [{ slug: "", title: "Welcome to our agency", nav_label: "Home" },
      { slug: "web-design", title: "Our excellent web design services", nav_label: "Our Work" },
      { slug: "meet-the-team", nav_label: "Too many words here" }];
    expect(pageMenuLinks(pages)).toEqual([
      { label: "Home", href: "/" }, { label: "Our Work", href: "/web-design" }, { label: "Meet The", href: "/meet-the-team" },
    ]);
    expect(menuLabelSchema.parse("  Work   with us ")).toBe("Work with us");
    expect(menuLabelSchema.safeParse("A menu label overload").success).toBe(false);
    expect(pageMenuLinks([{ slug: "services" }], "/s/sample")).toEqual([{ label: "Services", href: "/s/sample/services?preview=1" }]);
  });

  it("renders real anchors in header and footer and uses business profile data", () => {
    const content = [
      { type: "Navigation", props: { ...puckConfig.components.Navigation.defaultProps, id: "nav" } },
      { type: "Footer", props: { ...puckConfig.components.Footer.defaultProps, id: "footer", email: "wrong@example.test",
        navigation: [{ href: "/stale", label: "Stale page" }] } },
    ];
    const html = renderToStaticMarkup(createElement(Render, {
      config: puckConfig,
      data: { root: {}, content } as PuckPageData,
      metadata: { siteMenu: { links: pageMenuLinks([{ slug: "" }, { slug: "work", nav_label: "Our Work" }]),
        contacts: siteContacts({ ...emptyBusiness, email: "hello@example.test", businessName: "Example Studio" }) } },
    }));
    expect(html.match(/<a\b[^>]*href="\/work"[^>]*>Our Work<\/a>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/<a\b[^>]*href="mailto:hello@example.test"/);
    expect(html).not.toMatch(/wrong@example|Stale page|Our Work: \/work/);
  });
});
