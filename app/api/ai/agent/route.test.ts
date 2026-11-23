import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/ai/agent", () => ({ executeAgentRequest: mocks.execute }));
import { AiUserError } from "@/lib/ai/errors";
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

  it("shows limit messages written for the user and hides every other failure", async () => {
    const event = async () => JSON.parse((await (await POST(request())).text()).replace(/^data: |[\r\n]+$/g, ""));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.execute.mockRejectedValueOnce(new AiUserError("Your account has reached its hourly AI agent limit. Try again in about 12 minutes."));
    expect(await event()).toMatchObject({ type: "error", message: "Your account has reached its hourly AI agent limit. Try again in about 12 minutes." });
    mocks.execute.mockRejectedValueOnce(new Error("connection to 10.0.0.3 refused"));
    expect((await event()).message).toBe("The AI agent could not complete this request. Your saved drafts are unchanged.");
    log.mockRestore();
  });

  it("rejects oversized payloads before creating the stream", async () => {
    const response = await POST(request({ body: JSON.stringify({ message: "x".repeat(21_000) }) }));
    expect(response.status).toBe(413);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
