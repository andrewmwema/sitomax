"use client";

import { useActionState, useState } from "react";
import { applyLeadInboxAction, saveLeadNote, updateLeads } from "@/app/(dashboard)/dashboard/forms/actions";
import { leadStatuses, leadStatusLabels, type Lead, type LeadNote } from "@/lib/forms/submissions";
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

export function LeadInboxHeaderActions({ lead }: { lead: Lead }) {
  const [state, action, busy] = useActionState(applyLeadInboxAction, { error: "" });
  const reminderDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };
  const snoozeDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };
  return <div className="flex flex-wrap items-center gap-2">
    <form action={action}>
      <input type="hidden" name="leadIds" value={lead.id} />
      <input type="hidden" name="action" value={lead.starred ? "unstar" : "star"} />
      <button type="submit" data-lead-star className="platform-button" disabled={busy}>{lead.starred ? "Unstar" : "Star"}</button>
    </form>
    <form action={action}>
      <input type="hidden" name="leadIds" value={lead.id} />
      <input type="hidden" name="action" value={lead.archived ? "unarchive" : "archive"} />
      <button type="submit" data-lead-archive className="platform-button" disabled={busy}>{lead.archived ? "Unarchive" : "Archive"}</button>
    </form>
    {lead.deleted_at ? <>
      <form action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="restore" />
        <button type="submit" className="platform-button" disabled={busy}>Restore</button></form>
      <form action={action} onSubmit={(event) => { if (!window.confirm("Delete this lead forever? This cannot be undone.")) event.preventDefault(); }}>
        <input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="delete_forever" />
        <button type="submit" className="platform-button" disabled={busy}>Delete forever</button>
      </form>
    </> : <>
      <form action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value={lead.unread || lead.has_unread_reply || !lead.is_read ? "read" : "unread"} />
        <button type="submit" data-lead-unread className="platform-button" disabled={busy}>{lead.unread || lead.has_unread_reply || !lead.is_read ? "Mark read" : "Mark unread"}</button></form>
      <details className="relative">
        <summary className="platform-button cursor-pointer">Reminder</summary>
        <div className="absolute right-0 z-30 mt-1 w-56 space-y-1 rounded-lg border border-[var(--platform-line)] bg-[var(--platform-ground)] p-2 shadow-lg">
          {[1, 3, 7].map((days) => <form key={days} action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="remind" />
            <input type="hidden" name="remindAt" value={reminderDays(days)} /><button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--platform-subtle)]" disabled={busy}>{days} day{days === 1 ? "" : "s"}</button></form>)}
          <form action={action} className="border-t border-[var(--platform-line)] pt-2"><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="remind" />
            <label className="block text-xs">Custom date<input type="datetime-local" name="remindAt" required className="mt-1 block w-full border px-2 py-1" /></label>
            <button className="platform-button mt-2 w-full" disabled={busy}>Set reminder</button></form>
          {lead.remind_at ? <form action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="clear_reminder" />
            <button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--platform-subtle)]" disabled={busy}>Clear reminder</button></form> : null}
        </div>
      </details>
      <details className="relative">
        <summary className="platform-button cursor-pointer">Snooze</summary>
        <div className="absolute right-0 z-30 mt-1 w-56 space-y-1 rounded-lg border border-[var(--platform-line)] bg-[var(--platform-ground)] p-2 shadow-lg">
          {[1, 3, 7].map((days) => <form key={days} action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="snooze" />
            <input type="hidden" name="snoozeUntil" value={snoozeDays(days)} /><button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--platform-subtle)]" disabled={busy}>{days} day{days === 1 ? "" : "s"}</button></form>)}
          <form action={action} className="border-t border-[var(--platform-line)] pt-2"><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="snooze" />
            <label className="block text-xs">Until<input type="datetime-local" name="snoozeUntil" required className="mt-1 block w-full border px-2 py-1" /></label>
            <button className="platform-button mt-2 w-full" disabled={busy}>Snooze</button></form>
          {lead.snoozed_until ? <form action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="unsnooze" />
            <button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--platform-subtle)]" disabled={busy}>Unsnooze</button></form> : null}
        </div>
      </details>
    </>}
    <ActionMessage state={state} />
  </div>;
}

export function LeadStarButton({ lead }: { lead: Lead }) {
  const [state, action, busy] = useActionState(applyLeadInboxAction, { error: "" });
  return <form action={action}>
    <input type="hidden" name="leadIds" value={lead.id} />
    <input type="hidden" name="action" value={lead.starred ? "unstar" : "star"} />
    <button type="submit" aria-label={lead.starred ? "Unstar lead" : "Star lead"} data-lead-star disabled={busy}
      className={`rounded p-1 text-sm ${lead.starred ? "text-[var(--platform-accent)]" : "text-[var(--platform-muted)]"} opacity-70 group-hover:opacity-100`}>
      {lead.starred ? "★" : "☆"}
    </button>
    {state.error ? <span className="sr-only">{state.error}</span> : null}
  </form>;
}

export function LeadTrashActions({ lead }: { lead: Lead }) {
  const [state, action, busy] = useActionState(applyLeadInboxAction, { error: "" });
  return <div className="flex gap-1">
    <form action={action}><input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="restore" />
      <button type="submit" className="platform-button px-2" disabled={busy}>Restore</button></form>
    <form action={action} onSubmit={(event) => { if (!window.confirm("Delete this lead forever?")) event.preventDefault(); }}>
      <input type="hidden" name="leadIds" value={lead.id} /><input type="hidden" name="action" value="delete_forever" />
      <button type="submit" className="platform-button px-2" disabled={busy}>Delete forever</button></form>
    {state.error ? <span role="alert" className="sr-only">{state.error}</span> : null}
  </div>;
}
