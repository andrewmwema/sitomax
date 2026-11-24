import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), updateSession: vi.fn() }));
vi.mock("@/lib/brand", () => ({ brand: { appUrl: "https://app.agency.test", marketingSiteSubdomain: "sitomax" } }));
vi.mock("@/lib/redirect-lookup", () => ({ lookupTenantRedirect: mocks.lookup }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: mocks.updateSession }));
import { config, proxy } from "./proxy";

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
  it("allows email webhooks only on the canonical app host", async () => {
    for (const path of ["/api/email/inbound", "/api/email/events"]) {
      const allowed = await proxy(request(`https://app.agency.test${path}`));
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("x-middleware-next")).toBe("1");
      expect((await proxy(request(`https://client.test${path}`))).status).toBe(404);
    }
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

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
    for (const path of ["/dashboard", "/editor/page", "/login", "/signup", "/invite", "/auth/callback", "/api/ai/generate-site", "/api/forms/export"]) {
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

  it("passes the section showcase on development and Vercel preview hosts, but not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(request("https://client.app.github.dev/dev/sections", "client.app.github.dev"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const preview = await proxy(request("https://project-preview.vercel.app/dev/sections", "project-preview.vercel.app"));
    expect(preview.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();

    vi.stubEnv("VERCEL_ENV", "production");
    const production = await proxy(request("https://client.test/dev/sections", "client.test"));
    expect(production.headers.get("x-middleware-rewrite")).toContain("/s/client.test/dev/sections");
  });

  it("rewrites nested RSS paths to the tenant feed handler despite the XML asset matcher", async () => {
    const response = await proxy(request("https://client.test/journal/rss.xml?source=menu"));
    const target = new URL(response.headers.get("x-middleware-rewrite")!);
    expect(target.pathname).toBe("/s/client.test/blog-rss.xml");
    expect(target.searchParams.get("blogPath")).toBe("/journal");
    expect(target.searchParams.get("source")).toBe("menu");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("routes metadata through its root handlers on all hosts and redirects www", async () => {
    for (const path of ["/robots.txt", "/sitemap.xml"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
      for (const host of ["agency.test", "client.agency.test", "client.test", "app.agency.test"]) {
        const response = await proxy(request(`https://${host}${path}`));
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
      expect((await proxy(request(`https://www.agency.test${path}`))).headers.get("location"))
        .toBe(`https://agency.test${path}`);
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.updateSession).not.toHaveBeenCalled();
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
