import "server-only";

import { z } from "zod";
import { cleanLeadEmailHtml, replyHtmlText, replyTextHtml, stripQuotedReply } from "./reply-content";
import { verifyReplyAddress } from "./reply-token";

export const leadEmailAddress = z.email().max(254).transform((email) => email.toLowerCase());
const inbound = z.object({
  MessageID: z.string().trim().min(1).max(128),
  From: z.string().optional(), FromFull: z.object({ Email: z.string() }).optional(),
  To: z.string().optional(), ToFull: z.array(z.object({ Email: z.string() })).max(100).optional(),
  OriginalRecipient: z.string().optional(), MailboxHash: z.string().optional(),
  Subject: z.string().max(998).default(""),
  TextBody: z.string().max(500000).default(""), HtmlBody: z.string().max(500000).default(""),
  StrippedTextReply: z.string().max(500000).default(""),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).max(200).default([]),
  Attachments: z.array(z.unknown()).optional(),
});

export function parseLeadInbound(raw: unknown, domain: string, secret: string) {
  const parsed = inbound.safeParse(raw);
  if (!parsed.success) return null;
  const input = parsed.data;
  const recipientAddresses = [input.OriginalRecipient, ...(input.ToFull?.map((address) => address.Email) ?? []),
    ...(input.To?.split(",").map((address) => (/<([^<>]+)>/.exec(address)?.[1] ?? address).trim()) ?? [])];
  const leadIds = new Set(recipientAddresses.flatMap((address) => {
    const lead = address && verifyReplyAddress(address, domain, secret);
    return lead ? [lead] : [];
  }));
  const hashLead = input.MailboxHash && verifyReplyAddress(input.MailboxHash, domain, secret, true);
  if (hashLead) leadIds.add(hashLead);
  const sender = leadEmailAddress.safeParse((input.FromFull?.Email ?? input.From)?.trim());
  if (leadIds.size !== 1 || !sender.success) return null;
  const header = (name: string) => input.Headers.find((item) => item.Name.toLowerCase() === name)?.Value.trim();
  const autoSubmitted = header("auto-submitted");
  const auto = (autoSubmitted !== undefined && autoSubmitted.toLowerCase() !== "no")
    || Boolean(header("x-autoreply") || header("x-autorespond") || header("x-auto-response"))
    || /^(auto[- ]?reply|automatic reply|out of office)\s*:/i.test(input.Subject)
    || /^(bulk|junk|list|auto_reply)$/i.test(header("precedence") ?? "");
  const fullHtml = cleanLeadEmailHtml(input.HtmlBody);
  const fullText = input.TextBody.trim() || replyHtmlText(fullHtml) || input.StrippedTextReply.trim();
  const reply = input.StrippedTextReply.trim() || stripQuotedReply(fullText);
  return {
    leadId: [...leadIds][0], from: sender.data, providerId: input.MessageID, subject: input.Subject.trim(),
    inReplyTo: header("in-reply-to")?.slice(0, 998) || null, fullText, reply,
    html: replyTextHtml(reply || fullText), auto, attachments: Boolean(input.Attachments?.length),
  };
}
