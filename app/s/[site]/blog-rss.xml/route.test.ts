import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getSiteByHost: async () => ({ id: "site", name: "Example", subdomain: "client", custom_domain: null, domain_verified: false }),
  getSiteUrl: () => "https://example.com",
}));
vi.mock("@/lib/blog-public", () => ({
  getPublicBlogData: async () => ({
    settings: { available: true, blog_path: "/journal" },
    posts: [{
      id: "post", slug: "launch", published_at: "2026-01-01T00:00:00.000Z",
      publication: { metadata: { title: "News & updates", excerpt: "What's new", author: { name: "A. Writer" } } },
    }],
  }),
  blogPostUrl: () => "https://example.com/journal/launch",
  blogPublicPath: (_path: string, suffix = "") => `/journal${suffix ? `/${suffix}` : ""}`,
  escapeXml: (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"),
}));
import { GET } from "./route";

describe("tenant RSS feed", () => {
  it("serves published items at the configured blog path with escaped XML", async () => {
    const response = await GET(
      new Request("https://example.com/s/client/blog-rss.xml?blogPath=%2Fjournal"),
      { params: Promise.resolve({ site: "client" }) },
    );
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(xml).toContain("<title>News &amp; updates</title>");
    expect(xml).toContain("What&apos;s new");
    expect(xml).toContain("https://example.com/journal/launch");
  });

  it("does not serve a feed when the rewritten path does not match the site setting", async () => {
    const response = await GET(
      new Request("https://example.com/s/client/blog-rss.xml?blogPath=%2Fother"),
      { params: Promise.resolve({ site: "client" }) },
    );
    expect(response.status).toBe(404);
  });
});
