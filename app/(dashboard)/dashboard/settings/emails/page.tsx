import { requireSuperAdmin } from "@/lib/auth";
import { emailTemplates, renderEmailTemplate, type EmailTemplateId } from "@/emails/registry";
import { EmailPreviewClient } from "./preview-client";
import { sendEmailPreview } from "./actions";

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const selected = emailTemplates.find((template) => template.id === params.template)?.id
    ?? emailTemplates[0].id;
  const rendered = await renderEmailTemplate(selected as EmailTemplateId);
  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="platform-eyebrow mb-1">Email design system</p>
        <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">Preview the branded templates and send a test through Postmark.</p>
      </header>
      <EmailPreviewClient templates={emailTemplates} selected={selected} rendered={rendered} sendAction={sendEmailPreview} />
    </section>
  );
}
