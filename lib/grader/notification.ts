import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { emailBody } from "@/lib/email/message";
import { graderRpc } from "./worker";

const jobSchema = z.object({
  id: z.uuid(), lease_id: z.uuid(), lead_id: z.uuid(), site_id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/), domain: z.string(), url: z.string(),
  score: z.number().nullable(),
});

export function graderNotificationConfigured() {
  return z.email().safeParse(process.env.GRADER_NOTIFICATION_EMAIL?.trim()).success && isEmailConfigured();
}

export async function processGraderNotifications() {
  if (!graderNotificationConfigured()) throw new Error("Grader notification email is not configured.");
  const recipient = z.email().parse(process.env.GRADER_NOTIFICATION_EMAIL?.trim());
  const jobs = z.array(jobSchema).max(10).parse(await graderRpc("grader_claim_notifications", {}));
  let failures = 0;
  for (const job of jobs) {
    let success = false;
    try {
      const link = new URL(`/dashboard/leads/${job.lead_id}`, brand.appUrl).href;
      const text = `A website grader report was unlocked.\n\nWebsite: ${job.url}\nScore: ${job.score === null ? "Couldn't score" : `${job.score}/100`}\nReport: ${graderMarketingUrl(job.slug)}`;
      await sendEmail({
        to: recipient, subject: `New website grader lead: ${job.domain}`,
        ...emailBody(text, { label: "Open lead", url: link }), tag: "grader-notification",
        metadata: { lead_id: job.lead_id, site_id: job.site_id },
      });
      success = true;
    } catch {
      console.error("Could not send grader lead notification", { notificationId: job.id });
      failures++;
    }
    const finished = await graderRpc("grader_finish_notification", { p_id: job.id, p_lease: job.lease_id, p_success: success });
    if (finished !== true) throw new Error("Could not record grader notification result.");
  }
  return { processed: jobs.length, failures };
}

export function graderMarketingUrl(slug: string) {
  const protocol = brand.rootDomain.includes("localhost") ? "http" : "https";
  return new URL(`/grader/${encodeURIComponent(slug)}`, `${protocol}://${brand.rootDomain}`).href;
}
