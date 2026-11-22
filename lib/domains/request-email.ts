import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DomainEmailError, sendDomainEmail } from "./email";
import { EmailDeliveryError, isEmailConfigured } from "@/lib/email";
import { getAccountOwnerEmails } from "@/lib/email/recipients";
import { renderDomainCompleteEmail } from "@/emails/registry";

export async function notifyDomainRequestDone(requestId: string): Promise<void> {
  if (!isEmailConfigured()) throw new DomainEmailError("Completion emails are not configured. Ask your agency to enable domain emails.");
  const admin = createAdminClient();
  const now = new Date();
  const claimed = await admin.from("domain_requests").update({ notification_claimed_at: now.toISOString() })
    .eq("id", requestId).eq("status", "done").is("notification_sent_at", null)
    .or(`notification_claimed_at.is.null,notification_claimed_at.lt.${new Date(now.getTime() - 300_000).toISOString()}`)
    .select("id, site_id, domain, done_at").maybeSingle();
  if (claimed.error) throw new DomainEmailError("Could not prepare the completion email.");
  const request = claimed.data;
  if (!request) return;
  try {
    const site = await admin.from("sites").select("account_id").eq("id", request.site_id).maybeSingle();
    if (site.error || !site.data) throw new DomainEmailError("Could not load the account for the completion email.");
    const recipients = await getAccountOwnerEmails(admin, site.data.account_id);
    const rendered = await renderDomainCompleteEmail(request.domain, request.site_id);
    await sendDomainEmail(recipients, rendered.subject, rendered,
      `domain-request:${request.id}:${request.done_at}:${recipients.join(",")}`);
    const saved = await admin.from("domain_requests").update({
      notification_sent_at: new Date().toISOString(), notification_claimed_at: null,
    }).eq("id", request.id).eq("status", "done").eq("done_at", request.done_at)
      .eq("notification_claimed_at", now.toISOString());
    if (saved.error) throw new DomainEmailError("Email sent, but its notification status could not be saved.");
  } catch (error) {
    const released = await admin.from("domain_requests").update({ notification_claimed_at: null })
      .eq("id", request.id).eq("notification_claimed_at", now.toISOString());
    if (released.error) console.error("Could not release domain request notification", { requestId });
    if (error instanceof EmailDeliveryError) throw new DomainEmailError(error.message);
    throw error;
  }
}
