import { describe, expect, it } from "vitest";
import { parsePostmarkEvent } from "./postmark-events";

describe("parsePostmarkEvent", () => {
  it("normalizes addresses, limits reason data, and accepts only event metadata", () => {
    const parsed = parsePostmarkEvent({
      RecordType: "SpamComplaint",
      Email: " Person@Example.test ",
      Details: "  User marked the message as spam\u0000 ",
      MessageStream: " outbound ",
      ReceivedAt: "not-a-date",
      TextBody: "ignored",
    }, new Date("2025-01-02T03:04:05.000Z"));
    expect(parsed).toEqual({
      ignored: false,
      email: "person@example.test",
      type: "spam_complaint",
      reason: "User marked the message as spam",
      messageStream: "outbound",
      occurredAt: "2025-01-02T03:04:05.000Z",
      messageId: null, requestId: null, tag: "",
    });
  });

  it("ignores other record types and rejects malformed suppression addresses", () => {
    expect(parsePostmarkEvent({ RecordType: "Open" })).toEqual({ ignored: true });
    expect(parsePostmarkEvent({ RecordType: "Delivery" })).toBeNull();
    expect(parsePostmarkEvent({ RecordType: "Bounce", Email: "invalid" })).toBeNull();
  });

  it("parses delivery metadata and the recipient-specific timestamp", () => {
    expect(parsePostmarkEvent({ RecordType: "Delivery", Recipient: "Lead@example.test", MessageID: "postmark-id",
      Tag: "lead-reply", MessageStream: "leads", DeliveredAt: "2025-01-02T03:04:05Z",
      Metadata: { request_id: "00000000-0000-4000-8000-000000000001" },
    })).toMatchObject({ email: "lead@example.test", type: "delivery", messageId: "postmark-id",
      requestId: "00000000-0000-4000-8000-000000000001", occurredAt: "2025-01-02T03:04:05.000Z" });
    expect(parsePostmarkEvent({ RecordType: "Delivery", Recipient: "lead@example.test", DeliveredAt: "invalid" })).toBeNull();
  });
});
