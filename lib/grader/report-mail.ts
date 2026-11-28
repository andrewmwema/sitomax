import "server-only";

import { z } from "zod";
import { brand } from "@/lib/brand";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { emailBody, withBrandLogo } from "@/lib/email/message";
import { graderMarketingUrl } from "./notification";
import { graderPdf } from "./pdf";
import { graderSlugSchema } from "./public-report";
import { graderRpc } from "./worker";

const jobSchema = z.object({
  unlock_id: z.uuid(), lease_id: z.uuid(), email: z.email(), name: z.string().min(1).max(120), slug: graderSlugSchema,
});

export async function processGraderReportMail() {
  if (!isEmailConfigured()) throw new Error("Grader report email is not configured.");
  const jobs = z.array(jobSchema).max(5).parse(await graderRpc("grader_claim_report_mail", {}));
  let failures = 0;
  for (const job of jobs) {
    let success = false;
    try {
      const pdf = await graderPdf(job.slug);
      if (!pdf) throw new Error("Grader report is not available.");
      if (pdf.length > 7 * 1024 * 1024) {
        console.error("Grader report attachment exceeds email size limit", { unlockId: job.unlock_id });
        throw new Error("Grader report attachment is too large.");
      }
      const text = `Hi ${job.name},\n\nYour ${brand.name} website report is ready. Your PDF is attached.`;
      await sendEmail({
        to: job.email, subject: `Your ${brand.name} website report`,
        ...withBrandLogo(emailBody(text, { label: "View your report", url: graderMarketingUrl(job.slug) })),
        attachments: [{ name: "website-report.pdf", content: Buffer.from(pdf).toString("base64"), contentType: "application/pdf" }],
        tag: "grader-report", metadata: { grader_unlock_id: job.unlock_id },
      });
      success = true;
    } catch {
      console.error("Could not send grader report", { unlockId: job.unlock_id });
      failures++;
    }
    const finished = await graderRpc("grader_finish_report_mail", {
      p_unlock: job.unlock_id, p_lease: job.lease_id, p_success: success,
    });
    if (finished !== true) throw new Error("Could not record grader report email result.");
  }
  return { processed: jobs.length, failures };
}
