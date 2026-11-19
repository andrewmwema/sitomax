"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { submissionFields, type Submission } from "@/lib/forms/submissions";
import { WorkspaceDialog } from "./workspace-dialog";
import { MarkSubmissionRead } from "./mark-submission-read";

export function SubmissionDetails({ submission, siteName }: { submission: Submission; siteName: string }) {
  const [copyStatus, setCopyStatus] = useState<{ error?: string; success?: string }>({});
  const fields = submissionFields(submission.data);
  const valueText = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
  async function copyAnswers() {
    try {
      await navigator.clipboard.writeText(fields.map(([key, value]) => `${key}: ${valueText(value)}`).join("\n"));
      setCopyStatus({ success: "Answers copied." });
    } catch {
      setCopyStatus({ error: "Could not copy answers. Select and copy the text below instead." });
    }
  }
  return <WorkspaceDialog title="Submission details" description={`${siteName} · ${submission.form_name || "Form"}`}
    trigger={<>View details<span className="sr-only"> for submission received {new Date(submission.created_at).toLocaleString("en", { timeZone: "UTC" })} UTC</span></>}>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-[var(--platform-muted)]">Source website</dt><dd className="mt-1 font-medium">{siteName}</dd></div>
      <div><dt className="text-xs text-[var(--platform-muted)]">Form</dt><dd className="mt-1">{submission.form_name || "Form"}</dd></div>
      <div><dt className="text-xs text-[var(--platform-muted)]">Submitted (UTC)</dt><dd className="mt-1">{new Date(submission.created_at).toLocaleString("en", { timeZone: "UTC" })}</dd></div>
      <div><dt className="text-xs text-[var(--platform-muted)]">Page</dt><dd className="mt-1 break-all">{submission.page_path || "/"}</dd></div>
    </dl>
    <div className="flex items-center justify-between gap-3 border-y border-[var(--platform-line)] py-3">
      <span className="platform-status" data-tone={submission.is_read ? undefined : "accent"}>{submission.is_read ? "Read" : "New"}</span>
      {!submission.is_read ? <MarkSubmissionRead id={submission.id} /> : null}
    </div>
    <section><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Submitted answers</h3>
      {fields.length ? <button type="button" className="platform-button" onClick={copyAnswers}><Copy size={13} />Copy answers</button> : null}
    </div>
      {copyStatus.error ? <p role="alert" className="mt-3 text-xs text-[var(--platform-error)]">{copyStatus.error}</p> : null}
      {copyStatus.success ? <p role="status" className="mt-3 text-xs text-[var(--platform-success)]">{copyStatus.success}</p> : null}
      {fields.length ? <dl className="mt-4 divide-y divide-[var(--platform-line)]">{fields.map(([key, value]) => <div key={key} className="py-3 first:pt-0">
        <dt className="break-words text-xs font-medium text-[var(--platform-muted)]">{key}</dt>
        <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{valueText(value)}</dd>
      </div>)}</dl> : <p className="mt-3 text-sm text-[var(--platform-muted)]">This submission contains no answers.</p>}
    </section>
  </WorkspaceDialog>;
}
