import { Webhook } from "standardwebhooks";
import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail: send }));
import { POST } from "./route";

const secret = Buffer.alloc(32, 1).toString("base64");
function signedRequest(tamper = false) {
  const body = JSON.stringify({
    user: { email: "client@example.test" },
    email_data: { email_action_type: "recovery", token_hash: "pkce_test-hash", redirect_to: "https://other.example" },
  });
  const timestamp = new Date();
  return new Request("https://app.example.test/api/auth/send-email", {
    method: "POST",
    headers: {
      "webhook-id": "test-message",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign("test-message", timestamp, body),
    },
    body: tamper ? body.replace("client@", "other@") : body,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Supabase Auth send email hook", () => {
  it("sends a signed recovery event and uses the platform callback, not the supplied redirect", async () => {
    vi.stubEnv("SUPABASE_SEND_EMAIL_HOOK_SECRET", `v1,whsec_${secret}`);
    expect((await POST(signedRequest())).status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "client@example.test", tag: "password-reset",
      text: expect.stringContaining("/auth/callback?next=%2Fset-password&type=recovery&token_hash=pkce_test-hash"),
    }));
    expect(JSON.stringify(send.mock.calls)).not.toContain("other.example");
  });

  it("rejects a tampered payload without sending mail", async () => {
    vi.stubEnv("SUPABASE_SEND_EMAIL_HOOK_SECRET", `v1,whsec_${secret}`);
    expect((await POST(signedRequest(true))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});
