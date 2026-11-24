import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { createEvalRecorder } from "./eval-accounting.mjs";

const tokens = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWrite5mTokens: 2, cacheWrite1hTokens: 0 };
const response = { model: "test-model", usage: { cache_creation_input_tokens: 2 } };
const pricing = { messageUsage: () => tokens, calculateCostUsd: () => 0.001 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("AGENCY_AI_ACCESS_TOKEN", "test-token");
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("eval usage recording", () => {
  it("requires an authenticated agency session before a live call", async () => {
    vi.stubEnv("AGENCY_AI_ACCESS_TOKEN", "");
    await expect(createEvalRecorder(pricing)).rejects.toThrow("agency session");
    expect(mocks.createClient).not.toHaveBeenCalled();
    vi.stubEnv("AGENCY_AI_ACCESS_TOKEN", "test-token");
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(createEvalRecorder(pricing)).rejects.toThrow("not a super admin");
  });

  it("records every priced response and fails explicitly if the ledger is unavailable", async () => {
    const record = await createEvalRecorder(pricing);
    await record(response);
    expect(mocks.rpc).toHaveBeenLastCalledWith("record_ai_eval_usage", expect.objectContaining({
      p_id: expect.any(String), p_model: "test-model", p_input_tokens: 10,
      p_cache_read_tokens: 3, p_cache_write_5m_tokens: 2, p_cost_usd: 0.001,
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "OFFLINE" } });
    await expect(record(response)).rejects.toThrow("reconcile");
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-token");
    log.mockRestore();
  });
});
