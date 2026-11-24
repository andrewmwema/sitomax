import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_GENERATION_MODEL } from "./models";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), account: vi.fn(), rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import {
  beginSiteGeneration, checkpointDraft, checkLimit, completeDraftCheckpoints, finishSiteGeneration, getAiAgentRunUsage,
  recordUsage, reserveAiAgentSlot, startDraftCheckpoints,
} from "./usage";
import { describeAgentUsage } from "./agent-usage";
import { AiUserError } from "./errors";

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
    expect(mocks.rpc).toHaveBeenCalledWith("finish_ai_request_labeled", expect.objectContaining({
      p_request_id: id, p_cost_usd: 0.0031, p_action_type: "edit",
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
  it("uses scoped server-only checkpoint RPCs after authenticated account checks", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: true, error: null });
    await startDraftCheckpoints(id, id, id, { name: "Example", theme: {}, pages: [], business: {}, expectedBusiness: null });
    expect(mocks.rpc).toHaveBeenLastCalledWith("start_ai_draft_checkpoints", expect.objectContaining({
      p_generation_id: id, p_site_id: id, p_user_id: "authenticated-user", p_expected_business: null,
    }));
    expect(await checkpointDraft(id, id, id, { content: [] })).toBe(true);
    await completeDraftCheckpoints(id, id);
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_ai_draft_checkpoints", { p_generation_id: id, p_user_id: "authenticated-user" });
    mocks.account.mockResolvedValue({ data: null, error: null });
    mocks.admin.mockClear();
    await expect(checkpointDraft(id, id, id, {})).rejects.toThrow("access");
    await expect(startDraftCheckpoints(id, id, id, { name: "", theme: {}, pages: [], business: {}, expectedBusiness: null })).rejects.toThrow("access");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("surfaces checkpoint and concurrent Business failures rather than pretending drafts were saved", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Business information changed." } });
    await expect(startDraftCheckpoints(id, id, id, { name: "", theme: {}, pages: [], business: {}, expectedBusiness: {} })).rejects.toThrow("Business information changed");
    await expect(checkpointDraft(id, id, id, {})).rejects.toThrow("Could not save");
    await expect(completeDraftCheckpoints(id, id)).rejects.toThrow("Could not finalize");
  });
  it("counts agent requests against the account, showing the limit to the user and tolerating a missing migration", async () => {
    await reserveAiAgentSlot(id);
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_agent_slot", { p_user_id: "authenticated-user", p_account_id: id });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Your account has reached its hourly AI agent limit." } });
    await expect(reserveAiAgentSlot(id)).rejects.toThrow(AiUserError);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reserveAiAgentSlot(id)).resolves.toBeUndefined();
    log.mockRestore();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "DATABASE_ERROR" } });
    await expect(reserveAiAgentSlot(id)).rejects.toThrow("Could not check");
    mocks.account.mockResolvedValue({ data: null, error: null });
    mocks.admin.mockClear();
    await expect(reserveAiAgentSlot(id)).rejects.toThrow("access");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("shows clients the credits a run cost, and tokens and provider cost to the agency only", async () => {
    const tokens = { inputTokens: 12000, outputTokens: 3400, cacheReadTokens: 50000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
    const run = vi.fn();
    const isAgency = vi.fn();
    const access = vi.fn().mockResolvedValue({ data: { id }, error: null });
    const chain = (result: typeof run) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: result }) }) }) });
    const supabase = { from: () => chain(access), rpc: isAgency } as unknown as Parameters<typeof getAiAgentRunUsage>[0];
    mocks.admin.mockReturnValue({ from: () => chain(run) });
    const stored = (request: unknown) => ({ data: { usage: tokens, cost_usd: "0.063000000000", request }, error: null });

    isAgency.mockResolvedValue({ data: false, error: null });
    run.mockResolvedValueOnce(stored({ credits_used: 3, is_unlimited: false, status: "completed" }));
    const large = await getAiAgentRunUsage(supabase, id, id);
    expect(large).toEqual({ charge: "credits", credits: 3 });
    expect(describeAgentUsage(large!)).toBe("3 credits");
    run.mockResolvedValueOnce(stored({ credits_used: 0, is_unlimited: false, status: "completed" }));
    expect(describeAgentUsage((await getAiAgentRunUsage(supabase, id, id))!)).toBe("Included in your monthly AI allowance");
    run.mockResolvedValueOnce(stored({ credits_used: 1, is_unlimited: false, status: "failed" }));
    expect(await getAiAgentRunUsage(supabase, id, id)).toEqual({ charge: "none", credits: 0 });

    isAgency.mockResolvedValue({ data: true, error: null });
    run.mockResolvedValueOnce(stored({ credits_used: 0, is_unlimited: true, status: "completed" }));
    const agency = await getAiAgentRunUsage(supabase, id, id);
    expect(agency).toEqual({ charge: "unlimited", credits: 0, tokens, costUsd: 0.063 });
    expect(describeAgentUsage(agency!)).toBe("No credits charged (agency) · 12,000 input, 3,400 output, 50,000 cached tokens · $0.06");

    // Without access to the run, the server-side read never happens.
    access.mockResolvedValue({ data: null, error: null });
    run.mockClear();
    await expect(getAiAgentRunUsage(supabase, id, id)).rejects.toThrow("unavailable");
    expect(run).not.toHaveBeenCalled();
  });
});
