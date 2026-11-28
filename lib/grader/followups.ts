import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { emailBody } from "@/lib/email/message";
import { graderCheckDetail, graderCheckLabel } from "./check-presentation";
import { graderCtaUrl } from "./presentation";
import { graderSlugSchema } from "./public-report";
import { unsubscribeUrl } from "./unsubscribe";
import { graderRpc } from "./worker";

const jobSchema = z.object({
  unlock_id: z.uuid(), lead_id: z.uuid(), lease_id: z.uuid(), day: z.union([z.literal(2), z.literal(5), z.literal(10)]),
  email: z.email(), name: z.string().min(1).max(120), slug: graderSlugSchema,
  issues: z.array(z.object({ title: z.string(), why_it_matters: z.string(), fix: z.string() })).nullable(),
  checks: z.array(z.object({ id: z.string(), status: z.enum(["pass", "warn", "fail", "unknown"]), detail: z.string(), fix: z.string() })).nullable(),
});
type Job = z.infer<typeof jobSchema>;

function followupContent(job: Job) {
  const issues = job.issues ?? [];
  const findings = (job.checks ?? []).filter((check) => check.status === "fail" || check.status === "warn");
  if (job.day === 2) {
    const issue = issues[0];
    const check = findings[0];
    const text = issue ? `${issue.title}\n${issue.why_it_matters}\nSuggested fix: ${issue.fix}`
      : check ? `${graderCheckLabel(check.id)}\n${graderCheckDetail(check)}\nSuggested fix: ${check.fix}`
        : "Review your website report for the findings from your scan.";
    return { subject: "Your website's first fix", text: `Here's a place to start:\n\n${text}` };
  }
  if (job.day === 5) {
    const tips = findings.slice(0, 3).map((check) => `${graderCheckLabel(check.id)}: ${graderCheckDetail(check)}\nSuggested action: ${check.fix}`);
    return { subject: "Practical tips from your website scan",
      text: tips.length ? `Here are practical tips based on your scan:\n\n${tips.join("\n")}`
        : "Review your website report for the findings from your scan." };
  }
  return { subject: "A final check-in about your website", text: "If you'd like help with the findings in your website report, we're here to talk." };
}

export async function processGraderFollowups() {
  const stream = process.env.POSTMARK_GRADER_BROADCAST_STREAM?.trim();
  const address = process.env.GRADER_MAILING_ADDRESS?.trim();
  if (!isEmailConfigured() || !stream || !address || !process.env.GRADER_UNSUBSCRIBE_SECRET
    || process.env.GRADER_UNSUBSCRIBE_SECRET.length < 32 || !graderCtaUrl("test")) {
    throw new Error("Grader follow-up email is not configured.");
  }
  const jobs = z.array(jobSchema).max(10).parse(await graderRpc("grader_claim_followups", {}));
  let failures = 0, suppressed = 0;
  for (const job of jobs) {
    const eligible = await graderRpc("grader_check_followup", { p_unlock: job.unlock_id, p_day: job.day, p_lease: job.lease_id });
    if (eligible === false) { suppressed++; continue; }
    if (eligible !== true) throw new Error("Invalid grader follow-up eligibility response.");
    let success = false;
    try {
      const unsubscribe = unsubscribeUrl(job.unlock_id);
      const cta = graderCtaUrl(job.slug);
      if (!cta) throw new Error("Grader CTA is not configured.");
      const content = followupContent(job);
      const text = `Hi ${job.name},\n\n${content.text}\n\n${brand.name}\n${address}`;
      const body = emailBody(text, { label: "Talk to us", url: cta });
      const unsubscribeBody = emailBody("", { label: "Unsubscribe", url: unsubscribe });
      await sendEmail({
        to: job.email, subject: content.subject, preheader: body.preheader,
        text: `${body.text}\n\n${unsubscribeBody.text.trim()}`, html: `${body.html}${unsubscribeBody.html}`,
        stream, tag: "grader-followup", metadata: { grader_unlock_id: job.unlock_id, grader_day: String(job.day) },
        headers: [{ name: "List-Unsubscribe", value: `<${unsubscribe}>` },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" }],
      });
      success = true;
    } catch {
      console.error("Could not send grader follow-up", { unlockId: job.unlock_id, day: job.day });
      failures++;
    }
    const finished = await graderRpc("grader_finish_followup", {
      p_unlock: job.unlock_id, p_day: job.day, p_lease: job.lease_id, p_success: success,
    });
    if (finished !== true) throw new Error("Could not record grader follow-up result.");
  }
  return { processed: jobs.length, failures, suppressed };
}
