import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./index";

const message = {
  to: ["one@example.test", "two@example.test"], subject: "Subject", html: "<p>Body</p>",
  text: "Body", replyTo: "reply@example.test", tag: "invite" as const, metadata: { ref: "reference" },
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POSTMARK_SERVER_TOKEN", "test-token");
  vi.stubEnv("POSTMARK_FROM_EMAIL", "sender@example.test");
  vi.stubEnv("POSTMARK_MESSAGE_STREAM", "transactional");
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Postmark adapter", () => {
  it("sends both MIME alternatives, routing fields, and disables tracking for auth links", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ MessageID: "message-id", ErrorCode: 0 }));
    await sendEmail(message);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      From: "sender@example.test", To: "one@example.test,two@example.test", Subject: message.subject,
      TextBody: message.text, HtmlBody: message.html, ReplyTo: message.replyTo,
      MessageStream: "transactional", Tag: "invite", Metadata: message.metadata,
      TrackLinks: "None", TrackOpens: false,
    });
  });

  it("passes broadcast unsubscribe headers and attachments to the provider", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ MessageID: "message-id", ErrorCode: 0 }));
    await sendEmail({ ...message, stream: "broadcast", headers: [{ name: "List-Unsubscribe", value: "<https://example.test/unsubscribe>" }],
      attachments: [{ name: "report.pdf", content: "JVBERg==", contentType: "application/pdf" }] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      MessageStream: "broadcast", Headers: [{ Name: "List-Unsubscribe", Value: "<https://example.test/unsubscribe>" }],
      Attachments: [{ Name: "report.pdf", Content: "JVBERg==", ContentType: "application/pdf" }],
    });
  });

  it.each([
    [406, "inactive"],
    [401, "not verified"],
    [412, "pending approval"],
    [413, "not approved"],
  ])("returns an actionable error for provider code %i without logging private details", async (code, expected) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(Response.json({ ErrorCode: code, Message: "Private provider detail" }, { status: 422 }));
    await expect(sendEmail(message)).rejects.toThrow(expected);
    expect(log).toHaveBeenCalledWith("Email provider request failed", { tag: "invite", code, statusCode: 422 });
  });
});
