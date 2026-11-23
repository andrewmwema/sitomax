"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlarmClock, Bell, Copy, FileText, Mail, Pencil, Reply, StickyNote, Tag, Trash2, X } from "lucide-react";
import { saveLeadNote } from "@/app/(dashboard)/dashboard/forms/actions";
import { leadStatuses, leadStatusLabels, submissionContact, submissionFields, type Lead, type LeadEvent } from "@/lib/forms/submissions";
import { LocalTime } from "@/components/dashboard/local-time";
import type { ThreadNote } from "./thread";
import { IconButton, StatusPill, copyLeadValue, leadToast, useLeadMedia, useNow } from "./ui";

type Tab = "contact" | "notes" | "timeline";
const tabs: { value: Tab; label: string }[] = [
  { value: "contact", label: "Contact" }, { value: "notes", label: "Notes" }, { value: "timeline", label: "Timeline" },
];
const fieldLabel = (field: string) => {
  const text = field.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);

export function LeadDetailsDrawer({ id, lead, siteName, notes, events, showNotes, onToggleNotes, onFocus, onClose, onOpenNotes, mode = "drawer" }: {
  id: string; lead: Lead; siteName: string;
  /** Null when notes or the timeline could not be loaded. */
  notes: ThreadNote[] | null; events: LeadEvent[] | null;
  showNotes: boolean; onToggleNotes: () => void;
  /** Scrolls the conversation to a message ("form", a message id, or "note-…"). */
  onFocus: (target: string) => void;
  onClose: () => void;
  onOpenNotes?: () => void;
  mode?: "drawer" | "details" | "notes";
}) {
  const [tab, setTab] = useState<Tab>("contact");
  const overlay = useLeadMedia("(min-width: 768px) and (max-width: 1199px)") && mode === "drawer";
  const dialog = useRef<HTMLDialogElement>(null);
  const base = useId();
  const availableTabs = mode === "details" ? tabs.filter((item) => item.value !== "notes") : tabs;
  const activeTab = mode === "notes" ? "notes" : tab;
  const close = () => {
    dialog.current?.close();
    onClose();
    document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
  };
  const closeOnEscape = useEffectEvent(close);
  useEffect(() => {
    if (mode !== "drawer" || overlay) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented
        || (event.target as HTMLElement | null)?.closest('dialog, [role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      closeOnEscape();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [id, mode, overlay]);
  useEffect(() => {
    const element = dialog.current;
    if (!overlay || !element) return;
    element.showModal();
    return () => element.close();
  }, [overlay]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = availableTabs.findIndex((item) => item.value === tab);
    const next = availableTabs[(index + (event.key === "ArrowRight" ? 1 : -1) + availableTabs.length) % availableTabs.length].value;
    setTab(next);
    document.getElementById(`${base}-${next}-tab`)?.focus();
  };

  const content = <aside id={id} aria-label={mode === "notes" ? "Lead notes" : "Lead details"} className="leads-details" data-mode={mode}>
    {mode === "notes" ? <h2 className="border-b border-[var(--lead-line)] px-4 py-3 text-sm font-semibold">Internal notes</h2> :
    <div className="flex h-12 shrink-0 items-end border-b border-[var(--lead-line)] pl-4 pr-2">
      <div role="tablist" aria-label="Lead details" className="flex flex-1 gap-4" onKeyDown={onKeyDown}>
        {availableTabs.map((item) => <button key={item.value} type="button" role="tab" id={`${base}-${item.value}-tab`} aria-controls={`${base}-${item.value}`}
          aria-selected={tab === item.value} tabIndex={tab === item.value ? 0 : -1} onClick={() => setTab(item.value)}
          className={`-mb-px border-b-2 pb-3 pt-2 text-[13px] ${tab === item.value ? "border-[var(--lead-blue)] font-semibold text-[var(--lead-navy)]"
            : "border-transparent font-medium text-[var(--lead-muted)] hover:text-[var(--lead-navy)]"}`}>
          {item.label}{item.value === "notes" && notes?.length ? <span className="ml-1 text-xs font-normal text-[var(--lead-muted)]">{notes.length}</span> : null}
        </button>)}
      </div>
      {mode === "drawer" ? <IconButton label="Close details" tipAlign="end" className="mb-2" onClick={close}><X size={16} /></IconButton> : null}
    </div>}
    <div role={mode === "notes" ? undefined : "tabpanel"} id={`${base}-${activeTab}`}
      aria-labelledby={mode === "notes" ? undefined : `${base}-${activeTab}-tab`} className="leads-scroll flex-1 p-4">
      {activeTab === "contact" ? <ContactTab lead={lead} siteName={siteName} />
        : activeTab === "notes" ? <NotesTab lead={lead} notes={notes} showNotes={showNotes} onToggleNotes={onToggleNotes} />
        : <TimelineTab lead={lead} events={events} notes={notes} onFocus={onFocus} onNotes={(note) => {
          if (showNotes) onFocus(`note-${note}`);
          else if (onOpenNotes) onOpenNotes();
          else setTab("notes");
        }} />}
    </div>
  </aside>;
  return overlay ? <dialog ref={dialog} aria-label="Lead details" className="leads-ui leads-details-overlay"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>{content}</dialog> : content;
}

function Row({ label, children, copyValue }: { label: string; children: ReactNode; copyValue?: string }) {
  return <div className="group py-2">
    <dt className="text-xs text-[var(--lead-muted)]">{label}</dt>
    <dd className="mt-0.5 flex items-start gap-2 text-sm text-[var(--lead-navy)]">
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{children}</span>
      {copyValue ? <IconButton label={`Copy ${label.toLowerCase()}`} tipAlign="end" className="-my-1 size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        onClick={() => void copyLeadValue(copyValue, label)}><Copy size={13} /></IconButton> : null}
    </dd>
  </div>;
}

function ContactTab({ lead, siteName }: { lead: Lead; siteName: string }) {
  const contact = submissionContact(lead.data);
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  const dial = phone?.replace(/[\s().-]/g, "");
  const tel = dial && /^\+?[0-9]{3,20}$/.test(dial) ? `tel:${dial}` : null;
  const mailto = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${encodeURIComponent(email)}` : null;
  const link = "text-[var(--lead-blue)] hover:underline";
  const others = submissionFields(lead.data).filter(([, value]) => value !== contact.email && value !== contact.phone);
  return <div className="space-y-5">
    <section aria-labelledby="lead-contact-heading">
      <h3 id="lead-contact-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--lead-muted)]">Contact</h3>
      {email || phone ? <dl className="mt-1 divide-y divide-[var(--lead-line)]">
        {email ? <Row label="Email" copyValue={email}>{mailto ? <a href={mailto} className={link}>{email}</a> : email}</Row> : null}
        {phone ? <Row label="Phone" copyValue={phone}>{tel ? <a href={tel} className={link}>{phone}</a> : phone}</Row> : null}
      </dl> : <p className="py-2 text-sm text-[var(--lead-muted)]">No email or phone number was submitted.</p>}
    </section>
    {others.length ? <section aria-labelledby="lead-fields-heading">
      <h3 id="lead-fields-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--lead-muted)]">Submitted details</h3>
      <dl className="mt-1 divide-y divide-[var(--lead-line)]">
        {others.map(([field, value]) => {
          const text = typeof value === "string" ? value : JSON.stringify(value);
          return <Row key={field} label={fieldLabel(field)} copyValue={text}>{text}</Row>;
        })}
      </dl>
    </section> : null}
    <section aria-labelledby="lead-source-heading">
      <h3 id="lead-source-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--lead-muted)]">Source</h3>
      <dl className="mt-1 divide-y divide-[var(--lead-line)]">
        <Row label="Website">{siteName}</Row>
        <Row label="Page">{lead.page_path || "/"}</Row>
        <Row label="Form">{lead.form_name || "Form"}</Row>
        <Row label="Received"><LocalTime value={lead.created_at} /></Row>
        <Row label="Status"><StatusPill status={lead.status} /></Row>
      </dl>
    </section>
  </div>;
}

function NotesTab({ lead, notes, showNotes, onToggleNotes }: { lead: Lead; notes: ThreadNote[] | null; showNotes: boolean; onToggleNotes: () => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (intent: "add" | "edit" | "delete", body: string, note?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("lead", lead.id);
      form.set("site", lead.site_id);
      form.set("intent", intent);
      form.set("body", body);
      if (note) form.set("note", note);
      const result = await saveLeadNote({ error: "" }, form);
      if (result.error) { leadToast(result.error, "error"); return false; }
      leadToast(result.success ?? "Note saved.");
      return true;
    } catch {
      leadToast("Could not save this note. Check your connection and try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return <div className="space-y-4">
    <form className="space-y-2" onSubmit={async (event) => {
      event.preventDefault();
      if (await save("add", text)) setText("");
    }}>
      <label className="block text-xs font-medium text-[var(--lead-muted)]">Add an internal note
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000} required placeholder="Only your team sees notes."
          className="leads-input mt-1" /></label>
      <div className="flex items-center justify-between gap-2">
        <button type="button" role="switch" aria-checked={showNotes} onClick={onToggleNotes} className="flex items-center gap-2 text-xs text-[var(--lead-body)]">
          <span aria-hidden className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${showNotes ? "bg-[var(--lead-blue)]" : "bg-[#c9cedb]"}`}>
            <span className={`size-3 rounded-full bg-white transition-transform ${showNotes ? "translate-x-3" : ""}`} /></span>
          Show notes in thread
        </button>
        <button className="leads-button" data-variant="primary" disabled={busy || !text.trim()}>Add note</button>
      </div>
    </form>
    {notes === null ? <p role="alert" className="text-sm text-[#96281f]">Notes are unavailable.</p>
      : notes.length ? <ul className="space-y-2.5">
        {notes.map((note) => <li key={note.id} className="rounded-xl border border-[#f0e2a6] bg-[#fffbea] p-3">
          {editing?.id === note.id ? <form className="space-y-2" onSubmit={async (event) => {
            event.preventDefault();
            if (await save("edit", editing.text, note.id)) setEditing(null);
          }}>
            <textarea aria-label="Edit note" autoFocus value={editing.text} onChange={(event) => setEditing({ id: note.id, text: event.target.value })}
              rows={3} maxLength={4000} required className="leads-input" />
            <div className="flex justify-end gap-2">
              <button type="button" className="leads-button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="leads-button" data-variant="primary" disabled={busy || !editing.text.trim()}>Save</button>
            </div>
          </form> : <>
            <p className="whitespace-pre-wrap break-words text-sm text-[#4a3a00]">{note.body}</p>
            <div className="mt-1.5 flex items-center gap-1 text-xs text-[#6b5200]">
              <span className="flex-1"><LocalTime value={note.created_at} />{note.mine ? " · You" : ""}</span>
              {note.mine ? <>
                <IconButton label="Edit note" tipSide="top" tipAlign="end" className="size-7" disabled={busy} onClick={() => setEditing({ id: note.id, text: note.body })}><Pencil size={13} /></IconButton>
                <IconButton label="Delete note" tipSide="top" tipAlign="end" className="size-7" disabled={busy} onClick={() => {
                  if (window.confirm("Delete this note?")) void save("delete", "", note.id);
                }}><Trash2 size={13} /></IconButton>
              </> : null}
            </div>
          </>}
        </li>)}
      </ul> : <p className="text-sm text-[var(--lead-muted)]">No notes yet.</p>}
  </div>;
}

const eventIcons = { created: FileText, status_changed: Tag, note_added: StickyNote, email_sent: Mail, reply_received: Reply } as const;
const eventLabels = { created: "Lead received", status_changed: "Status changed", note_added: "Note added", email_sent: "Email sent", reply_received: "Reply received" } as const;

function TimelineTab({ lead, events, notes, onFocus, onNotes }: {
  lead: Lead; events: LeadEvent[] | null; notes: ThreadNote[] | null; onFocus: (target: string) => void; onNotes: (noteId: string) => void;
}) {
  const now = useNow();
  const item = "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left";
  return <ol className="space-y-0.5">
    {lead.remind_at ? <li className={item}><span className="mt-0.5 text-[var(--lead-blue)]"><Bell size={15} aria-hidden /></span>
      <span className="min-w-0 flex-1 text-sm text-[var(--lead-navy)]">Reminder scheduled<span className="block text-xs text-[var(--lead-muted)]"><LocalTime value={lead.remind_at} /></span></span></li> : null}
    {lead.snoozed_until && now && new Date(lead.snoozed_until).getTime() > now ? <li className={item}><span className="mt-0.5 text-[var(--lead-blue)]"><AlarmClock size={15} aria-hidden /></span>
      <span className="min-w-0 flex-1 text-sm text-[var(--lead-navy)]">Snoozed until<span className="block text-xs text-[var(--lead-muted)]"><LocalTime value={lead.snoozed_until} /></span></span></li> : null}
    {events === null ? <li role="alert" className="px-2 py-2 text-sm text-[#96281f]">The timeline is unavailable.</li> : events.map((event) => {
      const Icon = eventIcons[event.type] ?? FileText;
      const from = leadStatuses.find((status) => status === event.data?.from);
      const to = leadStatuses.find((status) => status === event.data?.to);
      const note = event.type === "note_added" ? notes?.find((candidate) => candidate.created_at === event.created_at) : undefined;
      const messageId = event.data?.message_id;
      const target = event.type === "created" ? "form"
        : (event.type === "email_sent" || event.type === "reply_received") && isUuid(messageId) ? messageId : null;
      const content = <>
        <span className="mt-0.5 text-[var(--lead-muted)]"><Icon size={15} aria-hidden /></span>
        <span className="min-w-0 flex-1 text-sm text-[var(--lead-navy)]">
          {eventLabels[event.type] ?? "Activity"}{from && to ? `: ${leadStatusLabels[from]} → ${leadStatusLabels[to]}` : ""}
          <span className="block text-xs text-[var(--lead-muted)]"><LocalTime value={event.created_at} /></span>
        </span>
      </>;
      return <li key={event.id}>
        {target || note ? <button type="button" className={`${item} hover:bg-[var(--lead-hover)]`}
          onClick={() => target ? onFocus(target) : note ? onNotes(note.id) : undefined}>{content}</button>
          : <div className={item}>{content}</div>}
      </li>;
    })}
  </ol>;
}
