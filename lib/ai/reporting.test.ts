import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), admin: vi.fn(), rpc: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize, requireSuperAdmin: mocks.admin }));
import { getAiUsageSummaries, getMonthlyAiCosts } from "./reporting";

const row = { account_id: "00000000-0000-4000-8000-000000000001", account_name: "Client A", requests: 1, cost_usd: "0.0014" };
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
    expect(mocks.rpc).toHaveBeenCalledWith("ai_account_summaries");
    mocks.range.mockResolvedValueOnce({ data: null, error: { code: "MISSING_MIGRATION" } });
    await expect(getAiUsageSummaries()).rejects.toThrow("migration");
  });
  it("requires agency permission, selects the requested UTC month and reads past the default row cap", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => row), error: null });
    mocks.range.mockResolvedValueOnce({ data: [{ ...row, account_name: "Last client" }], error: null });
    const rows = await getMonthlyAiCosts("2026-11");
    expect(mocks.admin).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("ai_monthly_costs", { p_month: "2026-11-01" });
    expect(mocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)).toMatchObject({ account_name: "Last client", cost_usd: 0.0014 });
    mocks.admin.mockRejectedValueOnce(new Error("not agency"));
    await expect(getMonthlyAiCosts("2026-11")).rejects.toThrow("not agency");
    await expect(getMonthlyAiCosts("2026-13")).rejects.toThrow();
  });
});
