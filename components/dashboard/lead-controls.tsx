"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveLeadNote, updateLeads } from "@/app/(dashboard)/dashboard/forms/actions";
import { leadStatuses, leadStatusLabels, type Lead, type LeadNote } from "@/lib/forms/submissions";
import { WorkspaceDialog } from "./workspace-dialog";

export function LeadDrawer({ title, description, closeHref, children }: {
  title: string; description: string; closeHref: string; children: ReactNode;
}) {
  const router = useRouter();
  return <WorkspaceDialog title={title} description={description} open onClose={() => router.replace(closeHref, { scroll: false })}>
    {children}
  </WorkspaceDialog>;
}

function ActionMessage({ state }: { state: { error?: string; success?: string } }) {
  return state.error ? <p role="alert" className="text-sm text-[var(--platform-error)]">{state.error}</p>
    : state.success ? <p role="status" className="text-sm text-[var(--platform-success)]">{state.success}</p> : null;
}

export function LeadStatusOptions() {
  return leadStatuses.map((status) => <option value={status} key={status}>{leadStatusLabels[status]}</option>);
}

export function LeadStatusForm({ lead }: { lead: Lead }) {
  const [state, action, busy] = useActionState(updateLeads, { error: "" });
  return <form action={action} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="id" value={lead.id} />
    <label className="flex flex-col gap-1 text-sm">Status
      <select name="status" defaultValue={lead.status} className="border px-3 text-sm"><LeadStatusOptions /></select>
    </label>
    <button className="platform-button" name="intent" value="status" disabled={busy}>Save status</button>
    <ActionMessage state={state} />
  </form>;
}

export function LeadBulkForm({ archived }: { archived: boolean }) {
  const [state, action, busy] = useActionState(updateLeads, { error: "" });
  return <form id="lead-bulk" action={action} className="flex flex-wrap items-center gap-2 px-4 py-3">
    <label className="text-sm">Selected leads: <select name="status" aria-label="New status for selected leads" className="border px-3 text-sm" defaultValue="">
      <option value="" disabled>Choose status</option><LeadStatusOptions />
    </select></label>
    <button className="platform-button" name="intent" value="status" disabled={busy}>Change status</button>
    <button className="platform-button" name="intent" value={archived ? "restore" : "archive"} disabled={busy}>{archived ? "Restore" : "Archive"}</button>
    <button className="platform-button" name="intent" value="export" disabled={busy}>Export selected</button>
    <ActionMessage state={state} />
  </form>;
}

export function LeadNoteForm({ leadId, siteId, note }: { leadId: string; siteId: string; note?: LeadNote }) {
  const [state, action, busy] = useActionState(saveLeadNote, { error: "" });
  return <form action={action} className="space-y-2">
    <input type="hidden" name="lead" value={leadId} /><input type="hidden" name="site" value={siteId} />
    {note ? <input type="hidden" name="note" value={note.id} /> : null}
    <label className="block text-sm">{note ? "Edit your note" : "Add a note"}
      <textarea name="body" className="mt-1 block w-full rounded-lg border p-2 text-sm" rows={3} maxLength={4000} required defaultValue={note?.body} />
    </label>
    <div className="flex gap-2">
      <button className="platform-button" name="intent" value={note ? "edit" : "add"} disabled={busy}>{note ? "Save edit" : "Add note"}</button>
      {note ? <button className="platform-button" name="intent" value="delete" formNoValidate disabled={busy}>Delete note</button> : null}
    </div>
    <ActionMessage state={state} />
  </form>;
}

export function CopyLeadValue({ value, label }: { value: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  return <><button type="button" className="platform-button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setFeedback(`${label} copied.`); }
    catch { setFeedback(`Could not copy ${label.toLowerCase()}.`); }
  }}>Copy {label.toLowerCase()}</button>{feedback ? <span role="status" className="text-xs">{feedback}</span> : null}</>;
}
