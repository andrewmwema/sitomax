import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: mocks.send }));
import { processGraderNotifications } from "./notification";

const job = {
  id: "96b28c25-ec84-4b9d-847e-1270aec46fd4", lease_id: "779b25dd-d7a2-42d2-bf62-3915ee7c88d4",
  lead_id: "e798cc81-0009-4202-b70b-35e60293916f", site_id: "b22bde21-d418-4420-9e7f-89b226db6bb4",
  slug: "example-123", domain: "example.com", url: "https://example.com/", score: 70,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GRADER_NOTIFICATION_EMAIL", "notify@example.com");
  mocks.rpc.mockImplementation(async (name: string) => name === "grader_claim_notifications" ? [job] : true);
  mocks.send.mockResolvedValue({ messageId: "id" });
});
describe("grader notifications", () => {
  it("sends a lead link and records successful delivery", async () => {
    expect(await processGraderNotifications()).toEqual({ processed: 1, failures: 0 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "notify@example.com", text: expect.stringContaining(`/dashboard/leads/${job.lead_id}`),
    }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_notification", expect.objectContaining({ p_success: true }));
  });
  it("records failures for retry instead of losing the job", async () => {
    mocks.send.mockRejectedValue(new Error("provider unavailable"));
    expect(await processGraderNotifications()).toEqual({ processed: 1, failures: 1 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_notification", expect.objectContaining({ p_success: false }));
  });
});
