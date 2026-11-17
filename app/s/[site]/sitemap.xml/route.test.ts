import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getSiteByHost: async () => ({ id: "site", subdomain: "client", custom_domain: "example.com", domain_verified: true, seo: {}, theme: {}, business: {} }),
  getPublishedSitePages: async () => [
    { slug: "", seo: {}, published_at: "2026-01-01T00:00:00Z" },
    { slug: "hidden", seo: { noindex: true }, published_at: "2026-01-01T00:00:00Z" },
    { slug: "services", seo: {}, published_at: null },
  ],
}));
import { GET } from "./route";

describe("tenant sitemap", () => {
  it("includes published indexable pages using canonical URLs", async () => {
    const response = await GET(new Request("https://client.test/sitemap.xml"), { params: Promise.resolve({ site: "client" }) });
    const xml = await response.text();
    expect(xml).toContain("https://example.com/");
    expect(xml).toContain("https://example.com/services");
    expect(xml).not.toContain("hidden");
    expect(response.headers.get("content-type")).toContain("application/xml");
  });
});
