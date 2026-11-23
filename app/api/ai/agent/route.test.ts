import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/ai/agent", () => ({ executeAgentRequest: mocks.execute }));
import { maxDuration, POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
  });
  mocks.execute.mockImplementation(async (_supabase, userId, body, emit) => {
    emit({ type: "done", userId, body });
  });
});

function request(options: { origin?: string; body?: string } = {}) {
  return new Request("https://agency.example/api/ai/agent", {
    method: "POST",
    headers: {
      origin: options.origin ?? "https://agency.example",
      "content-type": "application/json",
    },
    body: options.body ?? JSON.stringify({ action: "start", siteId: "site-1", message: "Improve the homepage" }),
  });
}

describe("AI agent transport", () => {
  it("uses the Node runtime budget required by the server-side model loop", () => {
    expect(maxDuration).toBe(300);
  });

  it("rejects cross-origin calls before authenticating or starting an agent", async () => {
    const response = await POST(request({ origin: "https://untrusted.example" }));
    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("streams authenticated events as SSE", async () => {
    const response = await POST(request());
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const payload = await response.text();
    expect(payload).toContain("data: ");
    expect(JSON.parse(payload.replace(/^data: |[\r\n]+$/g, ""))).toMatchObject({
      type: "done",
      userId: "user-1",
      body: { action: "start", message: "Improve the homepage" },
    });
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.any(Object),
      "user-1",
      { action: "start", siteId: "site-1", message: "Improve the homepage" },
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("rejects oversized payloads before creating the stream", async () => {
    const response = await POST(request({ body: JSON.stringify({ message: "x".repeat(21_000) }) }));
    expect(response.status).toBe(413);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
