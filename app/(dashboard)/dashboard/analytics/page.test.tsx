import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), report: vi.fn(), admin: false, owner: true }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize }));
import AnalyticsPage from "./page";

const ownSite = "00000000-0000-4000-8000-000000000001";
const otherSite = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.stubEnv("ANALYTICS_HASH_SALT", "a".repeat(32));
  vi.resetAllMocks(); mocks.admin = false; mocks.owner = true;
  mocks.report.mockResolvedValue({ data: {
    visits: 0, unique_visitors: 0, form_submissions: 0, daily: [], pages: [], referrers: [], devices: [],
  }, error: null });
  mocks.authorize.mockResolvedValue({
    user: { id: "user" },
    supabase: {
      from: (table: string) => table === "sites"
        ? { select: () => ({ order: async () => ({ data: [
          { id: ownSite, account_id: "own", name: "Own website", subdomain: "own" },
          { id: otherSite, account_id: "other", name: "Private other website", subdomain: "other" },
        ], error: null }) }) }
        : { select: () => ({ eq: () => ({ eq: async () => ({ data: mocks.owner ? [{ account_id: "own" }] : [], error: null }) }) }) },
      rpc: (name: string, args?: object) => name === "is_super_admin" ? Promise.resolve({ data: mocks.admin, error: null }) : mocks.report(name, args),
    },
  });
  afterEach(() => vi.unstubAllEnvs());
});

async function renderReport(params: { site?: string; days?: string }) {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<AnalyticsPage params={Promise.resolve({})} searchParams={Promise.resolve(params)} />, { onError: (error) => { errors.push(error); } });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("analytics report access", () => {
  it("only requests an owner's authorized site and preserves supported UTC date ranges", async () => {
    const html = await renderReport({ site: ownSite, days: "7" });
    expect(mocks.report).toHaveBeenCalledWith("site_analytics", { p_site_id: ownSite, p_days: 7 });
    expect(html).toContain("Own website");
    expect(html).not.toContain("Private other website");
    expect(html).toContain("UTC reporting");
  });
  it("rejects inaccessible sites and editor reporting access before calling the report RPC", async () => {
    expect(await renderReport({ site: otherSite })).toContain("do not have permission");
    expect(mocks.report).not.toHaveBeenCalled();
    mocks.owner = false;
    expect(await renderReport({})).toContain("Analytics is available to account owners");
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("rejects unsupported ranges instead of silently reporting a default period", async () => {
    expect(await renderReport({ days: "31" })).toContain("Choose a valid website");
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("shows a salt warning only to super admins when the salt is missing or too short", async () => {
    for (const salt of ["", "a".repeat(31)]) {
      vi.stubEnv("ANALYTICS_HASH_SALT", salt);
      mocks.admin = false;
      expect(await renderReport({})).not.toContain("ANALYTICS_HASH_SALT");
      mocks.admin = true;
      expect(await renderReport({})).toContain("Analytics collection is unavailable");
    }
    vi.stubEnv("ANALYTICS_HASH_SALT", "a".repeat(32));
    expect(await renderReport({})).not.toContain("ANALYTICS_HASH_SALT");
  });
});
