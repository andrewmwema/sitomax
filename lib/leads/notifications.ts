import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { emailBody } from "@/lib/email/message";
import { submissionContact } from "@/lib/forms/submissions";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
const emailAddress = z.email().max(254);

export async function newLeadRecipients(admin: Admin, site: { id: string; account_id: string }) {
  const { data, error } = await admin.rpc("lead_new_notification_recipients", { p_site: site.id });
  if (error) throw new EmailDeliveryError("Could not load lead notification recipients.");
  const recipients = z.array(emailAddress).max(50).safeParse(data);
  if (!recipients.success) throw new EmailDeliveryError("Lead notification recipients are invalid.");
  return recipients.data;
}

export async function notifyNewLead(admin: Admin, site: { id: string; account_id: string; name: string | null; subdomain: string },
  leadId: string, submission: { fields: unknown; formName: string; path: string }) {
  const settings = await admin.from("lead_site_settings").select("new_lead_enabled").eq("site_id", site.id).maybeSingle();
  if (settings.error) throw new EmailDeliveryError("Could not load lead notification settings.");
  if (settings.data?.new_lead_enabled === false) return;
  const recipients = await newLeadRecipients(admin, site);
  if (!recipients.length) throw new EmailDeliveryError("No eligible lead notification recipients.");
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
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason instanceof EmailDeliveryError
    ? failure.reason : new EmailDeliveryError("One or more lead notifications failed.");
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
