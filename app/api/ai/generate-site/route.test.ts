import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
const mocks = vi.hoisted(() => ({ build: vi.fn(), revalidate: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/ai/generate-site", () => ({ buildGeneratedSite: mocks.build, SiteGenerationError: class extends Error {} }));
import { AiProviderError, providerFailure } from "@/lib/ai/provider-error";
import { POST } from "./route";

beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
function request(origin = "https://agency.example") {
  return new Request("https://agency.example/api/ai/generate-site", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ businessName: "Example" }),
  });
}
describe("generation progress transport", () => {
  it("streams planning before generation completes, then returns the editor result and invalidates dashboards", async () => {
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    const result = { siteId: "site", pageId: "page", warnings: [] };
    mocks.build.mockImplementation(async (_input, emit) => {
      emit({ message: "Planning your site…" }); await barrier;
      emit({ message: "Finding photos…" }); return result;
    });
    const response = await POST(request());
    const requestId = response.headers.get("X-Request-ID");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.build).toHaveBeenCalledWith({ businessName: "Example" }, expect.any(Function), requestId);
    const reader = response.body!.getReader(), decoder = new TextDecoder();
    expect(JSON.parse(decoder.decode((await reader.read()).value))).toEqual({ type: "progress", message: "Planning your site…" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    finish();
    let remaining = "";
    while (true) { const chunk = await reader.read(); if (chunk.done) break; remaining += decoder.decode(chunk.value); }
    expect(remaining.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { type: "progress", message: "Finding photos…" }, { type: "result", ...result },
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/sites/site");
  });
  it("rejects cross-origin calls before starting generation", async () => {
    expect((await POST(request("https://untrusted.example"))).status).toBe(403);
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("does not expose raw failures or emit success-shaped results", async () => {
    mocks.build.mockRejectedValue(new Error("private provider details"));
    const events = await (await POST(request())).text();
    expect(JSON.parse(events)).toMatchObject({ type: "error", message: expect.stringContaining("Check your drafts") });
    expect(events).not.toContain("private provider details");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([true, false])("only sends provider details when the signed-in actor is a super admin: %s", async (isAdmin) => {
    const details = providerFailure(Anthropic.APIError.generate(400, {
      type: "error", error: { type: "invalid_request_error", message: "tool_choice is unsupported." },
    }, undefined, new Headers()))!;
    mocks.rpc.mockResolvedValue({ data: isAdmin, error: null });
    mocks.build.mockRejectedValue(new AiProviderError("Generation stopped.", details));
    const event = JSON.parse(await (await POST(request())).text());
    expect(event.type).toBe("error");
    expect(event.message).toBe(isAdmin
      ? "Generation stopped. Anthropic HTTP 400 (invalid_request_error): tool_choice is unsupported."
      : "Generation stopped.");
    expect(mocks.rpc).toHaveBeenCalledWith("is_super_admin");
  });
  it("withholds provider diagnostics that may echo submitted prompt data", () => {
    const details = providerFailure(Anthropic.APIError.generate(400, {
      type: "error", error: { type: "invalid_request_error", message: "messages.0.content: private business data" },
    }, undefined, new Headers()))!;
    expect(details.message).not.toContain("private business data");
  });
});
