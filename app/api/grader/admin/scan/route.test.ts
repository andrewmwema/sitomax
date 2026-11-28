import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), after: vi.fn(), process: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/grader/admin-auth", () => ({ graderAdmin: mocks.auth }));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/grader/scan", () => ({ processGraderReport: mocks.process }));

import { POST } from "./route";

function request(body: unknown, origin = "https://app.sitomax.com") {
  return new Request("https://app.sitomax.com/api/grader/admin/scan", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "8.8.8.8" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANALYTICS_HASH_SALT", "x".repeat(32));
  mocks.auth.mockResolvedValue({ ok: true, supabase: {} });
  mocks.rpc.mockResolvedValue({ id: "50da05be-c0bc-4d58-a49f-44f59f44bf09", slug: "test-1234" });
});
afterEach(() => vi.unstubAllEnvs());

describe("admin grader scan", () => {
  it.each([401, 403, 503])("rejects unauthorized users (%i) before starting a scan", async (status) => {
    mocks.auth.mockResolvedValue({ ok: false, status });
    expect((await POST(request({ url: "example.com" }))).status).toBe(status);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("starts a scan without Turnstile for an authenticated admin using the shared worker", async () => {
    const response = await POST(request({ url: "EXAMPLE.COM?utm_source=x", businessName: "Joe", city: "Austin", hasGoogleProfile: "yes" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ slug: "test-1234" });
    expect(mocks.rpc).toHaveBeenCalledWith("grader_create_report",
      expect.objectContaining({ p_url: "https://example.com/", p_business_name: "Joe", p_city: "Austin", p_profile: "yes",
        p_source: "admin", p_compare_slug: null }));
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.process).toHaveBeenCalledWith("50da05be-c0bc-4d58-a49f-44f59f44bf09",
      expect.objectContaining({ url: "https://example.com/" }));
  });

  it("rejects private addresses, invalid inputs, and cross-origin requests", async () => {
    expect((await POST(request({ url: "http://127.0.0.1" }))).status).toBe(400);
    expect((await POST(request({ url: "example.com", hasGoogleProfile: "maybe" }))).status).toBe(400);
    expect((await POST(request({ url: "example.com" }, "https://attacker.example"))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("starts a competitor scan linked to a report and reports missing base reports", async () => {
    expect((await POST(request({ url: "rival.example", compareSlug: "base-1234" }))).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("grader_create_report",
      expect.objectContaining({ p_source: "admin", p_compare_slug: "base-1234" }));
    mocks.rpc.mockResolvedValue({ error: "not_found" });
    expect((await POST(request({ url: "rival.example", compareSlug: "base-1234" }))).status).toBe(404);
    expect((await POST(request({ url: "rival.example", compareSlug: "Bad Slug" }))).status).toBe(400);
  });

  it("honors shared scan limits without scheduling", async () => {
    mocks.rpc.mockResolvedValue({ error: "busy" });
    expect((await POST(request({ url: "example.com" }))).status).toBe(429);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
