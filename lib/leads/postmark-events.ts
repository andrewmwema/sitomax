import { z } from "zod";

const payload = z.object({
  RecordType: z.string().trim().max(80),
  Email: z.string().trim().max(254).optional(),
  Description: z.string().max(10000).optional(),
  Details: z.string().max(10000).optional(),
  Type: z.string().max(1000).optional(),
  MessageStream: z.string().max(200).optional(),
  BouncedAt: z.string().max(100).optional(),
  ReceivedAt: z.string().max(100).optional(),
}).passthrough();
const emailAddress = z.email().max(254).transform((email) => email.toLowerCase());

export function parsePostmarkEvent(raw: unknown, now = new Date()) {
  const parsed = payload.safeParse(raw);
  if (!parsed.success) return null;
  const { RecordType } = parsed.data;
  if (RecordType !== "Bounce" && RecordType !== "SpamComplaint") return { ignored: true as const };
  const email = emailAddress.safeParse(parsed.data.Email);
  if (!email.success) return null;
  const rawTime = parsed.data.BouncedAt ?? parsed.data.ReceivedAt;
  const timestamp = rawTime ? new Date(rawTime) : now;
  const occurredAt = Number.isNaN(timestamp.getTime()) ? now.toISOString() : timestamp.toISOString();
  const reason = (parsed.data.Description ?? parsed.data.Details ?? parsed.data.Type ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim().slice(0, 1000);
  return {
    ignored: false as const,
    email: email.data,
    type: RecordType === "Bounce" ? "bounce" as const : "spam_complaint" as const,
    reason,
    messageStream: parsed.data.MessageStream?.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || "",
    occurredAt,
  };
}
