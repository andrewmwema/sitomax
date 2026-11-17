import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_GENERATION_MODEL } from "./models";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), account: vi.fn(), rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { beginSiteGeneration, checkLimit, finishSiteGeneration, recordUsage } from "./usage";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({
    user: { id: "authenticated-user" },
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.account }) }) }) },
  });
  mocks.account.mockResolvedValue({ data: { id }, error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
describe("AI server-side accounting", () => {
  it("uses the authenticated user and reserves the appropriate model only after account access", async () => {
    expect(await checkLimit(id, "generate_site")).toEqual({ id, model: SITE_GENERATION_MODEL });
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_request", {
      p_user_id: "authenticated-user", p_account_id: id, p_action: "generate_site",
      p_model: SITE_GENERATION_MODEL, p_site_id: null,
    });
    expect(mocks.account.mock.invocationCallOrder[0]).toBeLessThan(mocks.admin.mock.invocationCallOrder[0]);
  });
  it("does not construct an admin client when account access is absent or uncertain", async () => {
    mocks.account.mockResolvedValueOnce({ data: null, error: null });
    await expect(checkLimit(id, "edit_section")).rejects.toThrow("access");
    mocks.account.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    await expect(checkLimit(id, "edit_section")).rejects.toThrow("access");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("surfaces quota/rate denial and fails closed on database failure", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "AI rate limit reached" } });
    await expect(checkLimit(id, "edit_section")).rejects.toThrow("rate limit");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "DATABASE_ERROR" } });
    await expect(checkLimit(id, "edit_section")).rejects.toThrow("reserve");
  });
  it("records precise calculated cost and reports failed ledger writes", async () => {
    const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 1000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
    await recordUsage({ id, model: SITE_GENERATION_MODEL }, usage);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_ai_request", expect.objectContaining({
      p_request_id: id, p_cost_usd: 0.0031, p_failed: false,
    }));
    mocks.rpc.mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(recordUsage({ id, model: SITE_GENERATION_MODEL }, usage)).rejects.toThrow("remains held");
  });
  it("reserves one generation, rate-checks each child call and closes the shared quota separately", async () => {
    const generationId = await beginSiteGeneration(id, id);
    await checkLimit(id, "generate_site", { siteId: id, generationId });
    expect(mocks.rpc).toHaveBeenCalledWith("begin_ai_site_generation", expect.objectContaining({ p_account_id: id }));
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_generation_call", expect.objectContaining({
      p_generation_id: generationId, p_user_id: "authenticated-user",
    }));
    await finishSiteGeneration(generationId, true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_ai_site_generation", { p_generation_id: generationId, p_success: true });
  });
});
