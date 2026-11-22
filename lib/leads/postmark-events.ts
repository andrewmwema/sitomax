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
  DeliveredAt: z.string().max(100).optional(),
  Recipient: z.string().trim().max(254).optional(),
  MessageID: z.string().trim().min(1).max(128).optional(),
  Tag: z.string().max(200).optional(),
  Metadata: z.object({ request_id: z.unknown().optional() }).optional(),
}).passthrough();
const emailAddress = z.email().max(254).transform((email) => email.toLowerCase());

export function parsePostmarkEvent(raw: unknown, now = new Date()) {
  const parsed = payload.safeParse(raw);
  if (!parsed.success) return null;
  const { RecordType } = parsed.data;
  if (RecordType !== "Bounce" && RecordType !== "SpamComplaint" && RecordType !== "Delivery") return { ignored: true as const };
  const email = emailAddress.safeParse(RecordType === "Delivery" ? parsed.data.Recipient : parsed.data.Email);
  if (!email.success) return null;
  const rawTime = RecordType === "Delivery" ? parsed.data.DeliveredAt : parsed.data.BouncedAt ?? parsed.data.ReceivedAt;
  if (RecordType === "Delivery" && (!rawTime || Number.isNaN(new Date(rawTime).getTime()))) return null;
  const timestamp = rawTime ? new Date(rawTime) : now;
  const occurredAt = Number.isNaN(timestamp.getTime()) ? now.toISOString() : timestamp.toISOString();
  const reason = (parsed.data.Description ?? parsed.data.Details ?? parsed.data.Type ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim().slice(0, 1000);
  return {
    ignored: false as const,
    email: email.data,
    type: RecordType === "Bounce" ? "bounce" as const : RecordType === "Delivery" ? "delivery" as const : "spam_complaint" as const,
    reason,
    messageStream: parsed.data.MessageStream?.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || "",
    occurredAt,
    messageId: parsed.data.MessageID ?? null,
    requestId: z.uuid().safeParse(parsed.data.Metadata?.request_id).data ?? null,
    tag: parsed.data.Tag ?? "",
  };
}
