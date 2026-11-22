import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmailDeliveryError, isEmailConfigured, sendEmail } from "@/lib/email";
import { emailBody } from "@/lib/email/message";
import { getAccountOwnerEmails } from "@/lib/email/recipients";
import type { DnsRecord } from "@/lib/domains";
import { getProvider } from "./providers";
import { renderDomainLiveEmail, type RenderedEmail } from "@/emails/registry";

export class DomainEmailError extends Error {}

export async function sendDomainEmail(to: string[], subject: string, text: string | RenderedEmail, reference: string): Promise<void> {
  const body = typeof text === "string" ? { subject, ...emailBody(text) } : text;
  await sendEmail({
    to, subject: body.subject, html: body.html, text: body.text, preheader: body.preheader, tag: "domain",
    metadata: { notification_ref: createHash("sha256").update(reference).digest("hex") },
  });
}

export function instructionEmail(domain: string, providerId: string, records: DnsRecord[]) {
  const provider = getProvider(providerId);
  return [
    `Please help connect ${domain}.`, "",
    `DNS provider: ${provider.name}`,
    ...provider.steps.map((step, index) => `${index + 1}. ${step}`), "",
    "Add these DNS records (names are shown in full):",
    ...records.map((record) => `${record.type} | ${record.name} | ${record.value}`), "",
    "Replace conflicting website records only. Leave email (MX) and unrelated records unchanged.",
    ...(provider.dnsUrl ? [`DNS settings: ${provider.dnsUrl}`] : []),
    ...(provider.videoUrl ? [`Video guide: ${provider.videoUrl}`] : []),
    "The www address will redirect to the root. DNS changes can take up to 48 hours.",
  ].join("\n");
}

export async function notifyDomainLive(siteId: string): Promise<void> {
  if (!isEmailConfigured()) return;
  const admin = createAdminClient();
  const now = new Date();
  const claimed = await admin.from("sites").update({ domain_notification_claimed_at: now.toISOString() })
    .eq("id", siteId).eq("domain_verified", true).is("domain_notification_sent_at", null)
    .not("custom_domain", "is", null)
    .or(`domain_notification_claimed_at.is.null,domain_notification_claimed_at.lt.${new Date(now.getTime() - 300_000).toISOString()}`)
    .select("id, account_id, custom_domain, domain_pending_since").maybeSingle();
  if (claimed.error) throw new DomainEmailError("Could not prepare the domain notification.");
  const site = claimed.data;
  if (!site) return;
  try {
    const recipients = await getAccountOwnerEmails(admin, site.account_id);
    const rendered = await renderDomainLiveEmail(`https://${site.custom_domain}`, site.id);
    await sendDomainEmail(recipients, rendered.subject, rendered,
      `domain-live:${site.id}:${site.domain_pending_since}:${recipients.join(",")}`);
    const saved = await admin.from("sites").update({
      domain_notification_sent_at: new Date().toISOString(), domain_notification_claimed_at: null,
    }).eq("id", site.id).eq("custom_domain", site.custom_domain)
      .eq("domain_pending_since", site.domain_pending_since).eq("domain_notification_claimed_at", now.toISOString());
    if (saved.error) throw new DomainEmailError("Email sent, but its delivery status could not be saved.");
  } catch (error) {
    const released = await admin.from("sites").update({ domain_notification_claimed_at: null })
      .eq("id", site.id).eq("domain_notification_claimed_at", now.toISOString());
    if (released.error) console.error("Could not release domain email claim", { siteId });
    if (error instanceof EmailDeliveryError) throw new DomainEmailError(error.message);
    throw error;
  }
}
