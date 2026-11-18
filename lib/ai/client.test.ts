import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { SITE_GENERATION_MODEL, SMALL_EDIT_MODEL } from "./models";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), constructor: vi.fn(), check: vi.fn(), record: vi.fn(), release: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const { default: SDKOriginal } = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class SDK {
    static APIError = SDKOriginal.APIError;
    messages = { create: mocks.create };
    constructor(options: unknown) { mocks.constructor(options); }
  }
  return { default: SDK };
});
vi.mock("./usage", () => ({
  checkLimit: mocks.check, recordUsage: mocks.record, releaseFailedRequest: mocks.release,
}));
import { requestAi } from "./client";

const id = "00000000-0000-4000-8000-000000000001";
const input = { accountId: id, action: "rewrite_text" as const, messages: [{ role: "user" as const, content: "Rewrite this" }], maxTokens: 1024 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "local-test-not-a-key");
  mocks.check.mockResolvedValue({ id, model: SMALL_EDIT_MODEL });
  mocks.create.mockResolvedValue({ model: SMALL_EDIT_MODEL, content: [], usage: {
    input_tokens: 100, output_tokens: 25, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
  } });
  mocks.record.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("metered AI entry point", () => {
  it("reserves before a call and records actual usage before returning the result", async () => {
    await requestAi(input);
    expect(mocks.check).toHaveBeenCalledWith(id, "rewrite_text", { siteId: undefined, largeRewrite: false });
    expect(mocks.check.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.record).toHaveBeenCalledWith({ id, model: SMALL_EDIT_MODEL }, {
      inputTokens: 100, outputTokens: 25, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0,
    });
    expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });
  it("does not call the provider when configuration or limits fail", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(requestAi(input)).rejects.toThrow("not configured");
    expect(mocks.check).not.toHaveBeenCalled();
    vi.stubEnv("ANTHROPIC_API_KEY", "local-test-not-a-key");
    mocks.check.mockRejectedValueOnce(new Error("Monthly AI limit reached"));
    await expect(requestAi(input)).rejects.toThrow("limit");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("releases a provider failure, but holds a completed response when accounting fails", async () => {
    mocks.create.mockRejectedValueOnce(new Anthropic.APIError(429, undefined, "Test rejection", undefined));
    await expect(requestAi(input)).rejects.toThrow("AI request failed");
    expect(mocks.release).toHaveBeenCalledTimes(1);
    mocks.record.mockRejectedValueOnce(new Error("database down"));
    await expect(requestAi(input)).rejects.toThrow("usage could not be recorded");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("holds uncertain network or server outcomes instead of refunding potentially billed work", async () => {
    mocks.create.mockRejectedValueOnce(new Error("connection interrupted"));
    await expect(requestAi(input)).rejects.toThrow("outcome is uncertain");
    mocks.create.mockRejectedValueOnce(new Anthropic.APIError(500, undefined, "Server error", undefined));
    await expect(requestAi(input)).rejects.toThrow("outcome is uncertain");
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("selects Sonnet for large rewrites and records each cache-write duration", async () => {
    mocks.check.mockResolvedValueOnce({ id, model: SITE_GENERATION_MODEL });
    mocks.create.mockResolvedValueOnce({ model: SITE_GENERATION_MODEL, usage: {
      input_tokens: 30, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 150,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 50 },
    } });
    await requestAi({ ...input, largeRewrite: true, system: "Instructions", cacheTtl: "1h" });
    expect(mocks.check).toHaveBeenCalledWith(id, "rewrite_text", expect.objectContaining({ largeRewrite: true }));
    expect(mocks.record).toHaveBeenCalledWith({ id, model: SITE_GENERATION_MODEL }, {
      inputTokens: 30, outputTokens: 10, cacheReadTokens: 100, cacheWrite5mTokens: 100, cacheWrite1hTokens: 50,
    });
  });
  it("uses automatic tool choice for Sonnet without dropping strict schemas, caching or metering", async () => {
    const generationId = "00000000-0000-4000-8000-000000000002";
    mocks.check.mockResolvedValueOnce({ id, model: SITE_GENERATION_MODEL });
    mocks.create.mockResolvedValueOnce({ model: SITE_GENERATION_MODEL, usage: { input_tokens: 10, output_tokens: 10 } });
    const tools = [{ name: "plan_site", strict: true as const, input_schema: { type: "object" as const, properties: {}, additionalProperties: false } }];
    await requestAi({ ...input, action: "generate_site", generationId, tools, toolName: "plan_site", system: "Instructions", cacheTtl: "5m" });
    expect(mocks.check).toHaveBeenCalledWith(id, "generate_site", expect.objectContaining({ generationId }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      tools, tool_choice: { type: "auto", disable_parallel_tool_use: true },
      thinking: { type: "between_tools" },
      messages: [{ role: "user", content: expect.stringContaining("Call the plan_site tool exactly once") }],
      system: [{ type: "text", text: "Instructions", cache_control: { type: "ephemeral", ttl: "5m" } }],
    }));
  });
  it("retains forced tool choice for Haiku", async () => {
    const tools = [{ name: "rewrite_text", strict: true as const, input_schema: { type: "object" as const } }];
    await requestAi({ ...input, tools, toolName: "rewrite_text" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      model: SMALL_EDIT_MODEL, tool_choice: { type: "tool", name: "rewrite_text", disable_parallel_tool_use: true },
    }));
  });
  it("passes the exact Sonnet assistant tool turn and its error result to the SDK", async () => {
    mocks.check.mockResolvedValueOnce({ id, model: SITE_GENERATION_MODEL });
    mocks.create.mockResolvedValueOnce({ model: SITE_GENERATION_MODEL, usage: { input_tokens: 10, output_tokens: 10 } });
    const tool = { name: "fill_page", strict: false, input_schema: { type: "object" as const } };
    const previous = { role: "assistant" as const, content: [
      { type: "thinking" as const, thinking: "internal reasoning", signature: "signed" },
      { type: "tool_use" as const, id: "toolu_123", name: tool.name, input: {} },
    ] };
    const result = { role: "user" as const, content: [
      { type: "tool_result" as const, tool_use_id: "toolu_123", is_error: true, content: "Send valid props." },
    ] };
    await requestAi({ ...input, action: "generate_site", tools: [tool], toolName: tool.name,
      messages: [...input.messages, previous, result] });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ tools: [tool], messages: [
      { role: "user", content: expect.stringMatching(/^Call the fill_page tool exactly once[\s\S]+Rewrite this$/) },
      previous, result,
    ] }));
  });
  it("logs provider type, message and both references without credentials or raw SDK errors", async () => {
    const message = 'tool_choice: type "tool" and "any" are not supported for this model.';
    const cause = Anthropic.APIError.generate(400, {
      type: "error", error: { type: "invalid_request_error", message }, unused: "local-test-not-a-key",
    }, undefined, new Headers({ "request-id": "req_test" }));
    mocks.create.mockRejectedValueOnce(cause);
    await expect(requestAi(input)).rejects.toThrow("AI request failed");
    expect(console.error).toHaveBeenCalledWith("Anthropic request failed", expect.objectContaining({
      status: 400, type: "invalid_request_error", message, requestId: id, providerRequestId: "req_test",
    }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("local-test-not-a-key");
  });
  it("rejects unpriced caching before calling, and leaves unknown response models held", async () => {
    await expect(requestAi({ ...input, system: "Instructions", cacheTtl: "5m" })).rejects.toThrow("caching");
    expect(mocks.check).not.toHaveBeenCalled();
    mocks.create.mockResolvedValueOnce({ model: "unconfigured-model", usage: { input_tokens: 1, output_tokens: 1 } });
    await expect(requestAi(input)).rejects.toThrow("usage could not be recorded");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
