import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getSiteUrl: () => "https://example.com",
  getSiteByHost: async () => ({ id: "site", subdomain: "client", custom_domain: "example.com", domain_verified: true, seo: {}, theme: {}, business: {} }),
  getPublishedSitePages: async () => [
    { slug: "", seo: {}, published_at: "2026-01-01T00:00:00Z" },
    { slug: "hidden", seo: { noindex: true }, published_at: "2026-01-01T00:00:00Z" },
    { slug: "services", seo: {}, published_at: null },
  ],
}));
vi.mock("@/lib/blog-public", () => ({
  getPublicBlogData: async () => ({
    settings: { available: true, blog_path: "/blog" },
    posts: [
      { slug: "public-post", published_at: "2026-01-02T00:00:00Z", publication: { metadata: { noindex: false, canonical_url: "" } } },
      { slug: "private-post", published_at: "2026-01-02T00:00:00Z", publication: { metadata: { noindex: true, canonical_url: "" } } },
    ],
  }),
  blogPostUrl: (_site: unknown, _path: string, post: { slug: string }) => `https://example.com/blog/${post.slug}`,
  blogPublicPath: () => "/blog", escapeXml: (value: string) => value,
}));
import { GET } from "./route";

describe("tenant sitemap", () => {
  it("includes published indexable pages using canonical URLs", async () => {
    const response = await GET(new Request("https://client.test/sitemap.xml"), { params: Promise.resolve({ site: "client" }) });
    const xml = await response.text();
    expect(xml).toContain("https://example.com/");
    expect(xml).toContain("https://example.com/services");
    expect(xml).toContain("https://example.com/blog");
    expect(xml).toContain("https://example.com/blog/public-post");
    expect(xml).not.toContain("hidden");
    expect(xml).not.toContain("private-post");
    expect(response.headers.get("content-type")).toContain("application/xml");
  });
});
