"use server";

import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailTemplates, renderEmailTemplate, type EmailTemplateId } from "@/emails/registry";

export async function sendEmailPreview(templateId: string) {
  const parsed = z.enum(emailTemplates.map((template) => template.id) as [EmailTemplateId, ...EmailTemplateId[]]).safeParse(templateId);
  if (!parsed.success) return { error: "Unknown email template." };
  const { user } = await requireSuperAdmin();
  if (!user.email) return { error: "Your account has no verified email address." };
  try {
    const rendered = await renderEmailTemplate(parsed.data);
    await sendEmail({
      to: user.email,
      subject: `[Preview] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      preheader: rendered.preheader,
      tag: "form-notification",
    });
    return { success: "Test email sent." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the test email." };
  }
}
