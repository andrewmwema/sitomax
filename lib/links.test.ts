import { describe, expect, it } from "vitest";
import {
  linkAttributes, linkContext, normalizeExternalUrl, normalizePhone, pageSections,
  resolveDataLinks, resolveLink, resolveRichTextLinks, rewriteLegacyPageLinks, suggestAnchor,
} from "./links";

const PAGE = "123e4567-e89b-12d3-a456-426614174000";

describe("resolveLink", () => {
  it("resolves page links to the current slug, so links survive renames", () => {
    const link = { type: "page", pageId: PAGE, anchor: "team" };
    expect(resolveLink(link, linkContext([{ id: PAGE, slug: "about" }])).href).toBe("/about#team");
    expect(resolveLink(link, linkContext([{ id: PAGE, slug: "about-us" }])).href).toBe("/about-us#team");
    expect(resolveLink(link, linkContext([{ id: PAGE, slug: "about-us" }], "/s/acme")).href).toBe("/s/acme/about-us?preview=1#team");
  });

  it("marks links to deleted pages as broken", () => {
    expect(resolveLink({ type: "page", pageId: PAGE }, linkContext([]))).toMatchObject({ href: "#", broken: true });
  });

  it("builds mailto, tel and external links with options", () => {
    expect(resolveLink({ type: "email", email: "a@b.co", subject: "Hi there" }).href).toBe("mailto:a@b.co?subject=Hi%20there");
    expect(resolveLink({ type: "phone", phone: "+15551234567" }).href).toBe("tel:+15551234567");
    expect(linkAttributes({ type: "url", url: "https://a.com", newTab: true, nofollow: true }))
      .toEqual({ href: "https://a.com", target: "_blank", rel: "noopener noreferrer nofollow" });
  });

  it("rejects unsafe legacy strings and typed values", () => {
    expect(resolveLink("javascript:alert(1)")).toMatchObject({ href: "#", broken: true });
    expect(resolveLink("//evil.com")).toMatchObject({ href: "#", broken: true });
    expect(resolveLink({ type: "url", url: "javascript:alert(1)" }).broken).toBe(true);
    expect(resolveLink({ type: "page", pageId: PAGE, extra: 1 }).broken).toBe(true);
    expect(resolveLink("/contact").href).toBe("/contact");
  });
});

describe("normalizers", () => {
  it("adds https:// and only allows http(s)", () => {
    expect(normalizeExternalUrl("example.com/x")).toBe("https://example.com/x");
    expect(normalizeExternalUrl("http://a.com")).toBe("http://a.com");
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalUrl("https://user:pw@a.com")).toBeNull();
    expect(normalizeExternalUrl("not a url")).toBeNull();
  });

  it("normalizes phone numbers", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("rich text page links", () => {
  it("rewrites hrefs of data-page-id links to the current path and keeps anchors", () => {
    const html = `<p><a href="/old#faq" data-page-id="${PAGE}">x</a> <a href="https://a.com">y</a></p>`;
    const out = resolveRichTextLinks(html, linkContext([{ id: PAGE, slug: "new" }]));
    expect(out).toContain(`href="/new#faq" data-page-id="${PAGE}"`);
    expect(out).toContain('href="https://a.com"');
    expect(resolveDataLinks({ content: [{ props: { text: html } }] }, linkContext([{ id: PAGE, slug: "" }])).content[0].props.text)
      .toContain('href="/#faq"');
  });
});

describe("rewriteLegacyPageLinks", () => {
  it("rewrites exact old paths in strings and rich text, leaving others alone", () => {
    const data = { content: [{ props: {
      buttonLink: "/services#a", other: "/services-extra", text: '<a href="/services?x=1">s</a>', typed: { type: "page", pageId: PAGE },
    } }] };
    const { data: out, changed } = rewriteLegacyPageLinks(data, "services", "what-we-do");
    expect(changed).toBe(2);
    expect(out.content[0].props).toMatchObject({ buttonLink: "/what-we-do#a", other: "/services-extra", text: '<a href="/what-we-do?x=1">s</a>' });
    expect(rewriteLegacyPageLinks(data, "", "x").changed).toBe(0);
  });
});

describe("sections", () => {
  it("lists top-level sections with anchors and suggests unique anchors", () => {
    const sections = pageSections({ content: [
      { type: "Hero", props: { id: "h", heading: "<b>Welcome</b> home", design: { settings: { anchorId: "Top" } } } },
      { type: "Faq", props: { id: "f" } },
    ] });
    expect(sections).toEqual([
      { index: 0, id: "h", anchor: "top", label: "Welcome home" },
      { index: 1, id: "f", anchor: null, label: "Faq" },
    ]);
    expect(suggestAnchor("Our Pricing!", ["our-pricing"])).toBe("our-pricing-2");
  });
});

describe("resolveDataLinks", () => {
  it("renders typed links for blocks while leaving React elements, functions and strings alone", () => {
    const element = { $$typeof: Symbol.for("react.transitional.element"), props: { href: { type: "page", pageId: PAGE } } };
    const slot = () => null;
    const out = resolveDataLinks({
      buttonLink: { type: "page", pageId: PAGE, anchor: "team", newTab: true },
      legacy: "/contact", element, slot,
    }, linkContext([{ id: PAGE, slug: "about" }], "/s/demo"), { richText: false });
    expect(out.buttonLink).toEqual({ __resolved: true, href: "/s/demo/about?preview=1#team", newTab: true, nofollow: false, broken: false });
    expect(resolveLink(out.buttonLink)).toMatchObject({ href: "/s/demo/about?preview=1#team", newTab: true });
    expect(out.legacy).toBe("/contact");
    expect(out.element).toBe(element);
    expect(out.slot).toBe(slot);
  });
});
