import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { emailBody } from "@/lib/email/message";
import { getAccountOwnerEmails } from "@/lib/email/recipients";
import { submissionContact } from "@/lib/forms/submissions";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const emailAddress = z.email().max(254);

export async function newLeadRecipients(admin: Admin, site: { id: string; account_id: string }) {
  const [settings, preferences] = await Promise.all([
    admin.from("lead_site_settings").select("recipients").eq("site_id", site.id).maybeSingle(),
    admin.from("lead_notification_preferences").select("user_id, profiles(email, is_super_admin)")
      .eq("site_id", site.id).eq("new_lead", false),
  ]);
  if (settings.error || preferences.error) throw new EmailDeliveryError("Could not load lead notification settings.");
  const recipients = settings.data?.recipients?.length ? settings.data.recipients : await getAccountOwnerEmails(admin, site.account_id);
  const emails = z.array(emailAddress).max(50).parse(recipients);
  const suppressions = emails.length
    ? await admin.from("email_suppressions").select("email").in("email", emails.map((email) => email.toLowerCase()))
    : { data: [], error: null };
  if (suppressions.error) throw new EmailDeliveryError("Could not check lead notification recipients.");
  const suppressed = new Set((suppressions.data ?? []).map((entry) => entry.email));
  const muted = new Set<string>();
  if (preferences.data.length) {
    const members = await admin.from("account_members").select("user_id").eq("account_id", site.account_id)
      .eq("role", "owner").in("user_id", preferences.data.map((pref) => pref.user_id));
    if (members.error) throw new EmailDeliveryError("Could not check lead notification recipients.");
    const owners = new Set(members.data.map((member) => member.user_id));
    for (const pref of preferences.data) {
      const profile = z.object({ email: emailAddress, is_super_admin: z.boolean() }).safeParse(pref.profiles);
      if (profile.success && (profile.data.is_super_admin || owners.has(pref.user_id))) muted.add(profile.data.email.toLowerCase());
    }
  }
  return [...new Set(emails.map((email) => email.toLowerCase()))].filter((email) => !muted.has(email) && !suppressed.has(email));
}

export async function notifyNewLead(admin: Admin, site: { id: string; account_id: string; name: string | null; subdomain: string },
  leadId: string, submission: { fields: unknown; formName: string; path: string }) {
  const recipients = await newLeadRecipients(admin, site);
  const name = submissionContact(submission.fields).name?.trim().slice(0, 120);
  const summary = [
    `A new inquiry was saved for ${site.name ?? site.subdomain}.`,
    `Contact: ${name || "Not provided"}`,
    `Source: ${submission.formName || "Form"} (${submission.path})`,
    "Sign in to see contact details and the full submission.",
  ].join("\n");
  const message = emailBody(summary, { label: "View lead", url: `${brand.appUrl}/dashboard/forms?lead=${leadId}` });
  const results = await Promise.allSettled(recipients.map((to) => sendEmail({
    to, subject: "New website lead", ...message,
    tag: "form-notification", metadata: { site_id: site.id, lead_id: leadId },
  })));
  if (results.some((result) => result.status === "rejected")) throw new EmailDeliveryError("One or more lead notifications failed.");
}

export async function sendLeadDigest(digest: { email: string; site_id: string; site_name: string; received: number; awaiting: number }) {
  const to = emailAddress.parse(digest.email);
  const leadText = `${digest.received} new ${digest.received === 1 ? "lead" : "leads"}, ${digest.awaiting} awaiting reply`;
  await sendEmail({
    to, subject: "Your daily lead digest",
    ...emailBody(`${digest.site_name}: ${leadText}.\nNew leads are from the previous UTC day.`, {
      label: "Open leads", url: `${brand.appUrl}/dashboard/forms?site=${digest.site_id}`,
    }),
    tag: "form-notification", metadata: { site_id: digest.site_id },
  });
}
