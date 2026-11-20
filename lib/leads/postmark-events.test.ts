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
    });
  });

  it("ignores other record types and rejects malformed suppression addresses", () => {
    expect(parsePostmarkEvent({ RecordType: "Delivery" })).toEqual({ ignored: true });
    expect(parsePostmarkEvent({ RecordType: "Bounce", Email: "invalid" })).toBeNull();
  });
});
