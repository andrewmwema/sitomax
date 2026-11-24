import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), admin: vi.fn(), rpc: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize, requireSuperAdmin: mocks.admin }));
import { getAiUsageSummaries, getMonthlyAiCosts } from "./reporting";
import { reportingDays, reportingPeriod } from "./reporting-period";

const report = { clients: [{ account_id: "00000000-0000-4000-8000-000000000001", account_name: "Client A",
  requests: 1, cost_usd: "0.0014", agency_cost_usd: "0.002", credits_charged: 2 }],
agency: [], daily: [], totals: { clients: "0.0014", agency: "0.002", evals: "0", requests: 2 } };
beforeEach(() => {
  vi.resetAllMocks();
  const client = { supabase: { rpc: mocks.rpc } };
  mocks.authorize.mockResolvedValue(client);
  mocks.admin.mockResolvedValue(client);
  mocks.rpc.mockReturnValue({ order: () => ({ range: mocks.range }) });
  mocks.range.mockResolvedValue({ data: [], error: null });
});
describe("AI usage reporting", () => {
  it("uses the owner-scoped summary and never substitutes empty usage for a query failure", async () => {
    expect(await getAiUsageSummaries()).toEqual([]);
    expect(mocks.authorize).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("ai_account_plan_summaries");
    mocks.range.mockResolvedValueOnce({ data: null, error: { code: "MISSING_MIGRATION" } });
    await expect(getAiUsageSummaries()).rejects.toThrow("migration");
  });
  it("requires agency permission and returns the complete requested billing month", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: report, error: null });
    const result = await getMonthlyAiCosts("2026-11");
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("ai_cost_report", { p_month: "2026-11-01" });
    expect(result.clients[0]).toMatchObject({ cost_usd: 0.0014, agency_cost_usd: 0.002, credits_charged: 2 });
    expect(result.totals).toMatchObject({ clients: 0.0014, agency: 0.002 });
    mocks.admin.mockRejectedValueOnce(new Error("not agency"));
    await expect(getMonthlyAiCosts("2026-11")).rejects.toThrow("not agency");
    await expect(getMonthlyAiCosts("2026-13")).rejects.toThrow();
  });
  it("displays the exact billing boundaries in Chicago across daylight saving changes", () => {
    expect(reportingPeriod("2026-11")).toEqual({ start: "Oct 31, 2026, 7:00 PM CDT", end: "Nov 30, 2026, 6:00 PM CST" });
    expect(reportingDays("2026-11")).toHaveLength(31);
    expect(reportingDays("2026-11")[0]).toBe("2026-10-31");
    expect(reportingDays("2026-11").at(-1)).toBe("2026-11-30");
  });
});
