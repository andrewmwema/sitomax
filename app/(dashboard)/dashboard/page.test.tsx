import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sites: vi.fn(), cost: vi.fn(), query: vi.fn(), rpc: vi.fn(), reporting: true }));
vi.mock("@/lib/dashboard/sites", () => ({ getDashboardSites: mocks.sites }));
vi.mock("@/lib/ai/reporting", () => ({ getMonthlyAiCosts: mocks.cost }));
vi.mock("@/components/dashboard/ai-usage-cards", () => ({ AiUsageCards: () => null }));
import DashboardPage from "./page";

beforeEach(() => {
  vi.resetAllMocks(); mocks.reporting = true;
  const query = {
    select: () => query, order: () => query, limit: () => query, gte: () => query,
    then: (resolve: (result: { data: unknown[]; count: number; error: null }) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
  };
  mocks.query.mockReturnValue(query);
  mocks.rpc.mockResolvedValue({ data: { visits: 9, daily: [{ day: "2026-11-18", visits: 9 }] }, error: null });
  mocks.sites.mockImplementation(async () => ({
    supabase: { from: mocks.query, rpc: mocks.rpc }, profile: { full_name: "Client Member" },
    sites: [], isAdmin: false, canSeeReporting: mocks.reporting,
    ownerSite: mocks.reporting ? { id: "own-site", name: "Own website" } : undefined,
  }));
});

async function renderOverview() {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<DashboardPage />, { onError: (error) => { errors.push(error); } });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("dashboard overview polish", () => {
  it("shares the accessible daily chart without loading agency-only data for clients", async () => {
    const html = await renderOverview();
    expect(html).toContain("View daily values");
    expect(html).toContain("Daily recorded visits in UTC");
    expect(html).toContain('role="region" aria-label="Daily traffic values" tabindex="0"');
    expect(html).toContain("2026-11-18");
    expect(mocks.rpc).toHaveBeenCalledWith("site_analytics", { p_site_id: "own-site", p_days: 30 });
    expect(mocks.cost).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.flat()).not.toContain("accounts");
    expect(mocks.query.mock.calls.flat()).not.toContain("domain_requests");
  });

  it("keeps reporting queries and agency links out of editor-only overviews", async () => {
    mocks.reporting = false;
    const html = await renderOverview();
    expect(html).toContain("Traffic reporting is available to account owners");
    expect(html).not.toContain("View daily values");
    expect(html).not.toContain('href="/dashboard/clients"');
    expect(html).not.toContain('href="/dashboard/ai-usage"');
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cost).not.toHaveBeenCalled();
  });
});
