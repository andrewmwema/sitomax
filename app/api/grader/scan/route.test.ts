import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), after: vi.fn(), process: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/grader/http", async (original) => {
  const actual = await original<typeof import("@/lib/grader/http")>();
  return { ...actual, verifyTurnstile: mocks.verify };
});
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/grader/scan", () => ({ processGraderReport: mocks.process }));

import { POST } from "./route";

function request(body: unknown, origin = "https://sitomax.com") {
  return new Request("https://app.sitomax.com/api/grader/scan", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "8.8.8.8" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANALYTICS_HASH_SALT", "x".repeat(32));
  mocks.verify.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ id: "50da05be-c0bc-4d58-a49f-44f59f44bf09", slug: "test-1234" });
});

describe("grader scan endpoint", () => {
  it("verifies the challenge, creates a report, and schedules processing", async () => {
    const response = await POST(request({ url: "EXAMPLE.COM?utm_source=x", turnstileToken: "token" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ slug: "test-1234" });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://sitomax.com");
    expect(mocks.verify).toHaveBeenCalledWith("token", "8.8.8.8");
    expect(mocks.rpc).toHaveBeenCalledWith("grader_create_report",
      expect.objectContaining({ p_url: "https://example.com/" }));
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("rejects private addresses and untrusted origins before scheduling", async () => {
    expect((await POST(request({ url: "http://127.0.0.1", turnstileToken: "x" }))).status).toBe(400);
    expect((await POST(request({ url: "example.com", turnstileToken: "x" }, "https://attacker.example"))).status).toBe(403);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("starts a linked competitor scan and reports bases that can't be compared", async () => {
    const response = await POST(request({ url: "rival.com", turnstileToken: "x", compareSlug: "example-0123456789abcdef" }));
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("grader_create_report",
      expect.objectContaining({ p_compare_slug: "example-0123456789abcdef", p_source: "public" }));
    mocks.rpc.mockResolvedValue({ error: "not_found" });
    expect((await POST(request({ url: "rival.com", turnstileToken: "x", compareSlug: "example-0123456789abcdef" }))).status).toBe(404);
    expect((await POST(request({ url: "rival.com", turnstileToken: "x", compareSlug: "Bad Slug" }))).status).toBe(400);
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("reports quota limits without scheduling a job", async () => {
    mocks.rpc.mockResolvedValue({ error: "busy" });
    const response = await POST(request({ url: "example.com", turnstileToken: "x" }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("busy");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("still requires Turnstile verification on the public endpoint", async () => {
    mocks.verify.mockResolvedValue(false);
    const response = await POST(request({ url: "example.com", turnstileToken: "invalid" }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
