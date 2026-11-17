import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant", () => ({
  getSiteByHost: async () => ({ subdomain: "client", custom_domain: "example.com", domain_verified: true }),
}));
import { GET } from "./route";

describe("tenant robots", () => {
  it("advertises the canonical sitemap", async () => {
    const response = await GET(new Request("https://client.test/robots.txt"), { params: Promise.resolve({ site: "client" }) });
    expect(await response.text()).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});
