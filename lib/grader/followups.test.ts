import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: mocks.send }));
import { processGraderFollowups } from "./followups";

const job = {
  unlock_id: "96b28c25-ec84-4b9d-847e-1270aec46fd4",
  lease_id: "779b25dd-d7a2-42d2-bf62-3915ee7c88d4",
  lead_id: "e798cc81-0009-4202-b70b-35e60293916f", day: 5, name: "Example", email: "owner@example.com",
  slug: "example-123", issues: [{ title: "AI claim", why_it_matters: "Impact", fix: "AI fix" }],
  checks: [{ id: "title", status: "warn", detail: "Title is short.", fix: "Write a longer title." },
    { id: "https", status: "pass", detail: "TLS works.", fix: "Keep it working." }],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POSTMARK_GRADER_BROADCAST_STREAM", "grader-broadcast");
  vi.stubEnv("GRADER_MAILING_ADDRESS", "123 Example Street, Example City");
  vi.stubEnv("GRADER_UNSUBSCRIBE_SECRET", "x".repeat(32));
  vi.stubEnv("NEXT_PUBLIC_GRADER_CTA_URL", "https://sitomax.com/contact");
  mocks.rpc.mockImplementation(async (name: string) => name === "grader_claim_followups" ? [job] : true);
  mocks.send.mockResolvedValue({ messageId: "id" });
});
describe("grader follow-ups", () => {
  it("uses actual check facts, the broadcast stream, a physical address and unsubscribe links", async () => {
    expect(await processGraderFollowups()).toEqual({ processed: 1, failures: 0, suppressed: 0 });
    const message = mocks.send.mock.calls[0][0];
    expect(message.text).toContain("Title is short.");
    expect(message.text).toContain("Write a longer title.");
    expect(message.text).not.toContain("AI claim");
    expect(message.text).not.toContain("TLS works.");
    expect(message.text).toContain("123 Example Street");
    expect(message.html).toContain(">Unsubscribe</a>");
    expect(message.stream).toBe("grader-broadcast");
    expect(message.headers).toContainEqual({ name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_followup", expect.objectContaining({ p_success: true }));
  });
  it("rechecks suppression just before sending", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "grader_claim_followups" ? [job] : false);
    expect(await processGraderFollowups()).toEqual({ processed: 1, failures: 0, suppressed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refuses to claim work without mandatory broadcast configuration", async () => {
    vi.stubEnv("GRADER_MAILING_ADDRESS", "");
    await expect(processGraderFollowups()).rejects.toThrow("not configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
