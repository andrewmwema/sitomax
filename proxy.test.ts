import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), updateSession: vi.fn() }));
vi.mock("@/lib/redirect-lookup", () => ({ lookupTenantRedirect: mocks.lookup }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: mocks.updateSession }));
import { proxy } from "./proxy";

function request(url: string, host = new URL(url).host) {
  return new NextRequest(url, { headers: { host } });
}

beforeEach(() => {
  vi.stubEnv("ROOT_DOMAIN", "agency.test");
  mocks.lookup.mockReset();
  mocks.updateSession.mockReset().mockResolvedValue(NextResponse.next());
});
afterEach(() => vi.unstubAllEnvs());

describe("host routing", () => {
  it("passes app, local development and hosted preview domains through app session handling", async () => {
    for (const host of ["app.agency.test", "localhost:3000", "client.app.github.dev", "preview.vercel.app"]) {
      await proxy(request(`https://${host}/dashboard`, host));
    }
    expect(mocks.updateSession).toHaveBeenCalledTimes(4);
  });

  it("rewrites the root domain to the configured marketing tenant", async () => {
    const response = await proxy(request("https://agency.test/"));
    expect(response.headers.get("x-middleware-rewrite")).toContain("/s/sitomax");
  });

  it("redirects www to the root with a permanent redirect", async () => {
    const response = await proxy(request("https://www.agency.test/contact?from=www"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://agency.test/contact?from=www");
  });

  it("returns 404 for platform pages and private APIs on site hosts", async () => {
    for (const path of ["/dashboard", "/editor/page", "/login", "/auth/callback", "/api/ai/generate-site", "/api/forms/export"]) {
      expect((await proxy(request(`https://client.test${path}`))).status).toBe(404);
    }
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("passes only public-site APIs through on tenant hosts and the marketing root", async () => {
    for (const url of [
      "https://client.test/api/forms/submit",
      "https://client.test/api/analytics",
      "https://client.test/api/cron/domains",
      "https://agency.test/api/forms/submit",
    ]) {
      const response = await proxy(request(url));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});

describe("tenant redirects", () => {
  it("returns a 301 for configured paths and skips redirects in preview", async () => {
    mocks.lookup.mockResolvedValue("/new");
    const response = await proxy(request("https://client.test/old"));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://client.test/new");
    mocks.lookup.mockClear();
    const preview = await proxy(request("https://client.test/old?preview=1"));
    expect(preview.headers.get("x-middleware-rewrite")).toContain("/s/client.test/old");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
