import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), after: vi.fn(), configured: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/grader/http", async (original) => {
  const actual = await original<typeof import("@/lib/grader/http")>();
  return { ...actual, verifyTurnstile: mocks.verify };
});
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/grader/notification", () => ({
  graderNotificationConfigured: mocks.configured, processGraderNotifications: vi.fn(),
  graderMarketingUrl: (slug: string) => `https://sitomax.com/grader/${slug}`,
}));
import { POST } from "./route";

const body = {
  slug: "example-123", name: "Example", email: "EXAMPLE@example.com", phone: "",
  consentMarketing: false, turnstileToken: "token",
};
function request(data: unknown, origin = "https://sitomax.com") {
  return new Request("https://app.sitomax.com/api/grader/unlock", {
    method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": "8.8.8.8" },
    body: JSON.stringify(data),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANALYTICS_HASH_SALT", "x".repeat(32));
  vi.stubEnv("GRADER_LEADS_ACCOUNT_ID", "37cbb241-381b-4bb5-b85d-0bef401d0bd9");
  vi.stubEnv("GRADER_LEADS_SITE_ID", "c69087f8-4538-4d40-8905-51f36403ec48");
  mocks.configured.mockReturnValue(true);
  mocks.verify.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ ok: true });
});
describe("grader unlock", () => {
  it("verifies Turnstile, records consent and queues notification", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith("token", "8.8.8.8");
    expect(mocks.rpc).toHaveBeenCalledWith("grader_unlock_report", expect.objectContaining({
      p_email: "example@example.com", p_consent: false, p_phone: null,
      p_report_url: "https://sitomax.com/grader/example-123",
    }));
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it("rejects unverified and cross-origin submissions", async () => {
    mocks.verify.mockResolvedValue(false);
    expect((await POST(request(body))).status).toBe(403);
    expect((await POST(request(body, "https://attacker.example"))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("surfaces quota and configuration failures", async () => {
    mocks.rpc.mockResolvedValue({ error: "rate_limit" });
    expect((await POST(request(body))).status).toBe(429);
    mocks.configured.mockReturnValue(false);
    expect((await POST(request(body))).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
