import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ robots: vi.fn(), sitemap: vi.fn() }));
vi.mock("@/lib/brand", () => ({ brand: { rootDomain: "agency.test", marketingSiteSubdomain: "marketing" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/s/[site]/robots.txt/route", () => ({ GET: mocks.robots }));
vi.mock("@/app/s/[site]/sitemap.xml/route", () => ({ GET: mocks.sitemap }));
import { GET as robots } from "./robots.txt/route";
import { GET as sitemap } from "./sitemap.xml/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("host-aware metadata routes", () => {
  it.each([
    ["agency.test", "marketing"],
    ["client.agency.test", "client"],
    ["example.org", "example.org"],
  ])("passes %s to the handlers for tenant %s", async (host, site) => {
    vi.stubEnv("ROOT_DOMAIN", "agency.test");
    mocks.robots.mockResolvedValue(new Response("robots"));
    mocks.sitemap.mockResolvedValue(new Response("sitemap"));
    const request = new Request(`https://${host}/robots.txt`);
    expect(await (await robots(request)).text()).toBe("robots");
    expect(await (await sitemap(request)).text()).toBe("sitemap");
    for (const handler of [mocks.robots, mocks.sitemap]) {
      expect(await handler.mock.calls[0][1].params).toEqual({ site });
    }
  });

  it("disallows crawling and returns no sitemap for the platform", async () => {
    vi.stubEnv("ROOT_DOMAIN", "agency.test");
    const request = new Request("https://app.agency.test/robots.txt");
    const response = await robots(request);
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect((await sitemap(request)).status).toBe(404);
    expect(mocks.robots).not.toHaveBeenCalled();
    expect(mocks.sitemap).not.toHaveBeenCalled();
  });
});
