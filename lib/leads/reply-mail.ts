import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { leadEmailAddress } from "./inbound";
import { replyAddress, safeMailDomain } from "./reply-token";
import { leadReplyWorker } from "./reply-worker";
import { renderLeadForwardEmail } from "@/emails/registry";

export function leadMailConfig() {
  const domain = safeMailDomain(process.env.LEADS_FROM_DOMAIN);
  const stream = process.env.POSTMARK_LEADS_STREAM?.trim();
  return domain && stream ? { domain, stream } : null;
}

export function inboundReplyConfig() {
  const domain = safeMailDomain(process.env.INBOUND_REPLY_DOMAIN);
  const tokenSecret = process.env.LEAD_REPLY_TOKEN_SECRET;
  return domain && tokenSecret && tokenSecret.length >= 32 ? { domain, tokenSecret } : null;
}

export function leadSender(name: string, domain: string) {
  const display = name.replace(/[\x00-\x1f\x7f"\\<>]/g, " ").trim().slice(0, 120) || brand.name;
  return `"${display}" <leads@${domain}>`;
}

export function outboundReplyTo(leadId: string, route: { mode: "direct" | "tracked"; direct_to: string | null }) {
  if (route.mode === "direct") {
    const address = leadEmailAddress.safeParse(route.direct_to);
    if (!address.success) throw new EmailDeliveryError("No eligible reply mailbox. Add a notification recipient in Lead settings.");
    return address.data;
  }
  const config = inboundReplyConfig();
  if (!config) throw new EmailDeliveryError("Tracked replies are not configured. Contact your agency.");
  return replyAddress(leadId, config.domain, config.tokenSecret);
}

export function leadReplyPreview(name: string, leadId: string, route: { mode: "direct" | "tracked"; direct_to: string | null }) {
  const config = leadMailConfig();
  const from = config ? leadSender(name, config.domain) : null;
  try {
    return { from, replyTo: outboundReplyTo(leadId, route), replyToError: null };
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    return { from, replyTo: null, replyToError: error.message };
  }
}

const forwardJob = z.object({
  message_id: z.uuid(), recipient: z.string(), lease_id: z.uuid(), lead_id: z.uuid(), lead_name: z.string(),
  business: z.string(), lead_email: leadEmailAddress, subject: z.string(), body_text: z.string(), original_text: z.string(),
  has_attachments: z.boolean(),
});

export async function forwardLeadReplies(messageId?: string) {
  const config = leadMailConfig();
  if (!config) throw new EmailDeliveryError("Lead forwarding is not configured.");
  const { client, secret } = leadReplyWorker();
  const claim = await client.rpc("claim_lead_reply_forwards", { p_secret: secret, p_message: messageId ?? null });
  if (claim.error) throw new Error("Could not claim reply forwards", { cause: claim.error.code });
  const jobs = z.array(forwardJob).parse(claim.data);
  let failures = 0;
  for (let offset = 0; offset < jobs.length; offset += 10) {
    await Promise.all(jobs.slice(offset, offset + 10).map(async (job) => {
      let sent = false;
      try {
        const note = "Replies sent from your email won't appear in SitoMax history — reply in SitoMax to keep it.";
        const subject = job.subject.replace(/[\r\n\x00]/g, " ").trim();
        const attachments = job.has_attachments ? "Attachments not shown." : "";
        const rendered = await renderLeadForwardEmail({
          leadName: job.lead_name,
          business: job.business,
          bodyText: job.body_text,
          originalText: job.original_text,
          attachments,
          leadId: job.lead_id,
          note,
          subject: /^re:/i.test(subject) ? subject : `Re: ${subject || "your inquiry"}`,
        });
        await sendEmail({
          to: leadEmailAddress.parse(job.recipient), replyTo: job.lead_email,
          from: leadSender(`${job.lead_name} via ${job.business}`, config.domain), stream: config.stream, tag: "lead-forward",
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          preheader: rendered.preheader,
        });
        sent = true;
      } catch {
        failures++;
        console.error("Could not forward a lead reply; will retry when eligible", { messageId: job.message_id });
      }
      const finish = await client.rpc("finish_lead_reply_forward", {
        p_secret: secret, p_message: job.message_id, p_lease: job.lease_id, p_sent: sent,
      });
      if (finish.error || finish.data !== true) {
        failures++;
        console.error("Could not record reply forwarding outcome", { messageId: job.message_id, code: finish.error?.code });
      }
    }));
  }
  return { processed: jobs.length, failures };
}
