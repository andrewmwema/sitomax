import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/brand", () => ({ brand: { appUrl: "https://app.example.test" } }));
vi.mock("@/lib/leads/reply-worker", () => ({
  leadReplyWorker: () => ({ client: { rpc: mocks.rpc }, secret: "test-worker" }),
}));
import { POST } from "./route";

const auth = `Basic ${Buffer.from("postmark:fixture-password").toString("base64")}`;
const event = {
  RecordType: "Bounce",
  Email: "Lead@example.test",
  Description: "Mailbox does not exist",
  MessageStream: "outbound",
  BouncedAt: "2025-01-02T03:04:05Z",
  TextBody: "This content must not be stored or logged.",
};

function request(body: unknown, authorization = auth, host = "app.example.test") {
  return new Request(`https://${host}/api/email/events`, {
    method: "POST", headers: { authorization, host }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("POSTMARK_INBOUND_WEBHOOK_USER", "postmark");
  vi.stubEnv("POSTMARK_INBOUND_WEBHOOK_PASSWORD", "fixture-password");
});

describe("Postmark bounce and spam events", () => {
  it("authenticates, stores normalized suppression details, and returns quickly", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null });
    const response = await POST(request(event));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_postmark_email_event", {
      p_secret: "test-worker",
      p_email: "lead@example.test",
      p_event_type: "bounce",
      p_reason: "Mailbox does not exist",
      p_message_stream: "outbound",
      p_occurred_at: "2025-01-02T03:04:05.000Z",
    });
  });

  it("stores spam complaints and ignores unrelated record types", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1, error: null });
    expect((await POST(request({ ...event, RecordType: "SpamComplaint" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_postmark_email_event", expect.objectContaining({
      p_event_type: "spam_complaint",
    }));
    expect((await POST(request({ RecordType: "Delivery", Email: "lead@example.test" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rejects bad credentials and requests from non-app hosts", async () => {
    expect((await POST(request(event, "Basic invalid"))).status).toBe(401);
    expect((await POST(request(event, auth, "tenant.example.test"))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 200 for invalid payloads and database errors without exposing event content", async () => {
    expect((await POST(request({ ...event, Email: "not-an-email" }))).status).toBe(200);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect((await POST(request(event))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
