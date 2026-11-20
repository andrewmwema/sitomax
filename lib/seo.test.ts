import { describe, expect, it } from "vitest";
import { redirectSchema, siteSeoSchema } from "./seo";
import { canonicalUrl, localBusinessJsonLd, publicPageSeo } from "./seo-public";
import { seoChecklist } from "./seo-checklist";
import type { TenantSite } from "./tenant";

const site: TenantSite = {
  id: "site", account_id: "account", name: "Example", subdomain: "client",
  custom_domain: "example.com", domain_verified: true, theme: { logoUrl: "/logo.png" },
  business: { businessName: "Example", businessType: "Plumber", city: "London", address: "123 Street", phone: "123", openingHours: "Mo-Fr 09:00-17:00" },
  seo: { socialImage: "/share.jpg", noindex: true },
};

describe("site and page SEO", () => {
  it("uses verified canonical domains, site defaults and page overrides", () => {
    const meta = publicPageSeo(site, { title: "About", slug: "about", seo: { title: "", description: "Description", noindex: false } });
    expect(meta).toMatchObject({ title: "About", description: "Description", image: "https://example.com/share.jpg", noindex: false, canonical: "https://example.com/about" });
    expect(canonicalUrl({ ...site, domain_verified: false }, "")).toContain("client.");
    expect(publicPageSeo(site, { title: "Home", slug: "", seo: {} }).noindex).toBe(true);
  });
  it("uses the business profile for structured data", () => {
    expect(localBusinessJsonLd(site)).toMatchObject({
      "@type": "Plumber", name: "Example", telephone: "123", address: { streetAddress: "123 Street" },
      openingHours: "Mo-Fr 09:00-17:00", url: "https://example.com", logo: "https://example.com/logo.png",
    });
  });
  it("rejects unsafe settings and off-site redirects", () => {
    expect(siteSeoSchema.safeParse({ socialImage: "javascript:alert(1)" }).success).toBe(false);
    expect(siteSeoSchema.safeParse({ googleAnalyticsId: "G-1');alert(1)//" }).success).toBe(false);
    expect(redirectSchema.safeParse({ fromPath: "/old", toPath: "//evil.test" }).success).toBe(false);
    expect(redirectSchema.safeParse({ fromPath: "/old", toPath: "/\\evil.test" }).success).toBe(false);
    expect(redirectSchema.safeParse({ fromPath: "/old", toPath: "/new?ref=old" }).success).toBe(true);
  });
  it("scores nested content and flags missing alt, no H1 and noindex", () => {
    const seo = siteSeoSchema.parse({ noindex: true });
    const result = seoChecklist({ root: { props: { seoTitle: "A", description: "D", socialImage: "/share.jpg", indexing: "index" } },
      content: [{ type: "Section", props: { content: [{ type: "Heading", props: { level: "h1", text: "Heading" } },
        { type: "Gallery", props: { images: [{ url: "/photo.jpg", alt: "" }] } }] } }] }, "Page", seo);
    expect(result.issues).toEqual(["Images missing alt text"]);
    expect(result.score).toBe(86);
    expect(seoChecklist({ content: [] }, "", seo).issues).toContain("Page is hidden from search engines");
  });
  it("scores each page's own headings, alt text and unreplaced placeholders", () => {
    const settings = siteSeoSchema.parse({});
    const clean = seoChecklist({
      root: { props: { seoTitle: "Page", description: "Description", socialImage: "/share.jpg" } },
      content: [{ type: "Hero", props: { id: "hero", heading: "Welcome" } }],
    }, "Page", settings);
    const incomplete = seoChecklist({
      root: { props: { seoTitle: "Page", description: "Description", socialImage: "/share.jpg" } },
      content: [{ type: "Gallery", props: { id: "gallery", images: [{ url: "/photo.jpg", alt: "" }], heading: "[Add a heading]" } }],
    }, "Page", settings);
    expect(clean.score).toBe(100);
    expect(incomplete.issues).toContain("Images missing alt text");
    expect(incomplete.issues).toContain("Page has no H1 heading");
    expect(incomplete.issues).toContain("Unreplaced placeholders");
    expect(incomplete.checks.find((check) => check.key === "placeholders")?.targetId).toBe("gallery");
  });
  it("recognizes the actual rich heading level rather than assuming every Hero is H1", () => {
    const settings = siteSeoSchema.parse({});
    const hasH1 = (heading: string) => seoChecklist({ content: [{ type: "Hero", props: { heading } }] }, "Page", settings)
      .checks.find((check) => check.key === "h1")?.complete;
    expect(hasH1("Legacy title")).toBe(true);
    expect(hasH1("<h1>Title</h1>")).toBe(true);
    expect(hasH1("<h2>Title</h2>")).toBe(false);
    expect(hasH1("<p>Title</p>")).toBe(false);
  });
  it("uses the exact 60- and 160-character limits", () => {
    const data = (title: string, description: string) => ({
      root: { props: { seoTitle: title, description, socialImage: "/share.jpg" } },
      content: [{ type: "Hero", props: { heading: "Heading" } }],
    });
    const settings = siteSeoSchema.parse({});
    expect(seoChecklist(data("t".repeat(60), "d".repeat(160)), "Page", settings).issues).toEqual([]);
    expect(seoChecklist(data("t".repeat(61), "d".repeat(161)), "Page", settings).issues).toEqual([
      "SEO title is over 60 characters", "Meta description is over 160 characters",
    ]);
  });
});
