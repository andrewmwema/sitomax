import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DnsRecord } from "@/lib/domains";
import { getProvider } from "./providers";
import { brand } from "@/lib/brand";

export class DomainEmailError extends Error {}

export async function sendDomainEmail(to: string[], subject: string, text: string, key: string): Promise<void> {
  const token = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!token || !from) throw new DomainEmailError("Email is not configured. Ask your agency to enable domain emails.");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256").update(key).digest("hex") },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new DomainEmailError("Could not send the email. Please try again.");
  }
  if (!response.ok) throw new DomainEmailError("Could not send the email. Please try again or contact your agency.");
  let result: unknown;
  try { result = await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    throw new DomainEmailError("The email service returned an invalid response. Please try again.");
  }
  if (!z.object({ id: z.string().min(1) }).safeParse(result).success) {
    throw new DomainEmailError("The email service did not confirm delivery. Please try again.");
  }
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

export async function getAccountOwnerEmails(admin: ReturnType<typeof createAdminClient>, accountId: string): Promise<string[]> {
  const members = await admin.from("account_members").select("user_id").eq("account_id", accountId).eq("role", "owner");
  if (members.error || !members.data?.length) throw new DomainEmailError("No account owner could be found for the domain email.");
  const profiles = await admin.from("profiles").select("email").in("id", members.data.map((member) => member.user_id));
  if (profiles.error) throw new DomainEmailError("Could not load domain email recipients.");
  const recipients = [...new Set((profiles.data ?? []).map((profile) => profile.email))]
    .filter((email): email is string => z.email().safeParse(email).success).sort();
  if (!recipients.length || recipients.length > 50) throw new DomainEmailError("Check the account owners' email addresses before sending.");
  return recipients;
}

export async function notifyDomainLive(siteId: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
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
    const text = `Your domain is live\n\nhttps://${site.custom_domain} is now connected to your website.\nThe www address redirects to your root domain.\n\nManage your site: ${brand.appUrl}/dashboard/sites/${site.id}/domains`;
    await sendDomainEmail(recipients, "Your domain is live", text,
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
    throw error;
  }
}
