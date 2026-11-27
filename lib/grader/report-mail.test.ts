import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), pdf: vi.fn() }));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc }));
vi.mock("./pdf", () => ({ graderPdf: mocks.pdf }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: mocks.send }));
import { processGraderReportMail } from "./report-mail";

const job = { unlock_id: "96b28c25-ec84-4b9d-847e-1270aec46fd4",
  lease_id: "779b25dd-d7a2-42d2-bf62-3915ee7c88d4",
  name: "Example", email: "owner@example.com", slug: "example-123" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => name === "grader_claim_report_mail" ? [job] : true);
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.send.mockResolvedValue({ messageId: "id" });
});
describe("grader report email", () => {
  it("sends a transactional report link and PDF and records success", async () => {
    expect(await processGraderReportMail()).toEqual({ processed: 1, failures: 0 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: job.email, tag: "grader-report", text: expect.stringContaining("/grader/example-123"),
      attachments: [expect.objectContaining({ contentType: "application/pdf", content: "JVBERg==" })],
    }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_report_mail", expect.objectContaining({ p_success: true }));
  });
  it("records PDF or email failures for retry", async () => {
    mocks.pdf.mockRejectedValue(new Error("storage unavailable"));
    expect(await processGraderReportMail()).toEqual({ processed: 1, failures: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_report_mail", expect.objectContaining({ p_success: false }));
  });
  it("does not submit an attachment that exceeds the email size budget", async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array(7 * 1024 * 1024 + 1));
    expect(await processGraderReportMail()).toEqual({ processed: 1, failures: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith("grader_finish_report_mail", expect.objectContaining({ p_success: false }));
  });
});
