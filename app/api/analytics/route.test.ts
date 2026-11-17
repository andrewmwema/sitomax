import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), site: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/tenant", () => ({
  getTenantKeyFromHost: (host: string) => host === "agency.test" ? "sitomax" : host,
  getSiteByHost: mocks.site,
}));
import { POST } from "./route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://client.test/api/analytics", {
    method: "POST",
    headers: { host: "client.test", "x-forwarded-for": "203.0.113.10", "user-agent": "iPhone", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
  vi.stubEnv("ANALYTICS_HASH_SALT", "a".repeat(32));
  mocks.site.mockResolvedValue({ id: "site-1" });
  mocks.insert.mockResolvedValue({ error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("analytics beacon", () => {
  it("stores only privacy-reduced data and rotates identifiers by day and site", async () => {
    const body = { path: "/contact", referrer: "https://search.example/results?q=private" };
    expect((await POST(request(body, { "x-vercel-ip-country": "us" }))).status).toBe(204);
    const row = mocks.insert.mock.calls[0][0];
    expect(row).toMatchObject({ site_id: "site-1", path: "/contact", referrer: "https://search.example", device: "mobile", country: "US" });
    expect(JSON.stringify(row)).not.toContain("203.0.113.10");
    expect(row.visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    await POST(request(body));
    expect(mocks.insert.mock.calls[1][0].visitor_hash).toBe(row.visitor_hash);
    vi.setSystemTime(new Date("2026-03-11T00:00:00Z"));
    await POST(request(body));
    expect(mocks.insert.mock.calls[2][0].visitor_hash).not.toBe(row.visitor_hash);
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    mocks.site.mockResolvedValue({ id: "site-2" });
    await POST(request(body));
    expect(mocks.insert.mock.calls[3][0].visitor_hash).not.toBe(row.visitor_hash);
  });

  it("uses the marketing tenant for analytics posted to the root domain", async () => {
    const req = new Request("https://agency.test/api/analytics", {
      method: "POST",
      headers: { host: "agency.test", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ path: "/", referrer: "" }),
    });
    expect((await POST(req)).status).toBe(204);
    expect(mocks.site).toHaveBeenCalledWith("sitomax");
  });

  it("rejects malformed or cross-origin input and fails closed without a salt or IP", async () => {
    const body = { path: "/contact?email=private", referrer: "" };
    expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request({ path: "/", referrer: "" }, { origin: "https://other.test" }))).status).toBe(403);
    expect((await POST(request({ path: "/", referrer: "x".repeat(9000) }))).status).toBe(413);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ANALYTICS_HASH_SALT", "");
    expect((await POST(request({ path: "/", referrer: "" }))).status).toBe(503);
    vi.stubEnv("ANALYTICS_HASH_SALT", "a".repeat(32));
    expect((await POST(request({ path: "/", referrer: "" }, { "x-forwarded-for": "unknown" }))).status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("drops same-site referrers and reports database errors", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "insert failed" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ path: "/", referrer: "https://client.test/page" }))).status).toBe(500);
    expect(mocks.insert.mock.calls[0][0].referrer).toBeNull();
    vi.restoreAllMocks();
  });
});
