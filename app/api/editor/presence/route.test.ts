import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { POST } from "./route";

const pageId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
function request(options: { origin?: string; fetchSite?: string; body?: string } = {}) {
  // sendBeacon posts a string as text/plain.
  return new Request("https://agency.example/api/editor/presence", {
    method: "POST",
    headers: {
      origin: options.origin ?? "https://agency.example", "content-type": "text/plain;charset=UTF-8",
      ...(options.fetchSite ? { "sec-fetch-site": options.fetchSite } : {}),
    },
    body: options.body ?? JSON.stringify({ pageId, sessionId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
});

describe("editor presence close beacon", () => {
  it("closes the caller's session with their own credentials", async () => {
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledWith("heartbeat_page_editor", { p_page_id: pageId, p_session_id: sessionId, p_close: true });
  });

  it("rejects cross-origin, malformed and signed-out requests without touching presence", async () => {
    expect((await POST(request({ origin: "https://untrusted.example" }))).status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect((await POST(request({ body: "not json" }))).status).toBe(400);
    expect((await POST(request({ body: JSON.stringify({ pageId, sessionId, close: false }) }))).status).toBe(400);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("trusts the browser's same-origin signal when a proxy hides the public host", async () => {
    const tunnelled = { origin: "https://tunnel.example" };
    expect((await POST(request({ ...tunnelled, fetchSite: "same-origin" }))).status).toBe(204);
    expect((await POST(request({ ...tunnelled, fetchSite: "same-site" }))).status).toBe(403);
    expect((await POST(request({ fetchSite: "cross-site" }))).status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("reports a page the caller cannot access as not found", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await POST(request())).status).toBe(404);
  });
});
