"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock, Archive, ArchiveRestore, ArrowLeft, Bell, Check, ChevronDown, Copy, Download, Ellipsis, Info, Mail, MailOpen,
  RotateCcw, Star, StickyNote, Trash2, X,
} from "lucide-react";
import { leadStatuses, leadStatusLabels, submissionContact, type Lead } from "@/lib/forms/submissions";
import { leadDisplayName, leadIsUnread, untilLabel } from "./format";
import { useLeadInbox } from "./inbox";
import { leadActionPatch, runLeadAction, setLeadStatus, type LeadInboxActionName } from "./lead-actions";
import { Avatar, IconButton, MenuItem, Popover, StatusPill, leadToast, useNow } from "./ui";

const fullDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    leadToast(`${label} copied.`);
  } catch {
    leadToast(`Could not copy the ${label.toLowerCase()}.`, "error");
  }
}

export function ConversationHeader({ lead: saved, siteName, canTrash, detailsOpen, detailsId, onToggleDetails, showNotes, onToggleNotes }: {
  lead: Lead; siteName: string; canTrash: boolean;
  detailsOpen: boolean; detailsId: string; onToggleDetails: () => void;
  showNotes: boolean; onToggleNotes: () => void;
}) {
  const inbox = useLeadInbox();
  const router = useRouter();
  const now = useNow();
  // Shown immediately; dropped as soon as the server sends the lead again.
  const [pending, setPending] = useState<{ base: Lead; changes: Partial<Lead> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);
  const lead = pending?.base === saved ? { ...saved, ...pending.changes } : saved;
  const contact = submissionContact(lead.data);
  const name = leadDisplayName(lead.data);
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  const dial = phone?.replace(/[\s().-]/g, "");
  const tel = dial && /^\+?[0-9]{3,20}$/.test(dial) ? `tel:${dial}` : null;
  const unread = leadIsUnread(lead);
  const trashed = Boolean(lead.deleted_at);
  const snoozed = Boolean(lead.snoozed_until && (!now || new Date(lead.snoozed_until).getTime() > now));
  const listHref = `/dashboard/leads${inbox?.queryString ?? ""}`;

  const apply = async (changes: Partial<Lead>, request: () => Promise<string | null>, done?: string) => {
    if (busy) return false;
    setBusy(true);
    setPending({ base: saved, changes });
    inbox?.patch([saved.id], changes);
    const error = await request();
    setBusy(false);
    if (error) {
      setPending(null);
      inbox?.reload();
      leadToast(error, "error");
      return false;
    }
    if (done) leadToast(done);
    return true;
  };
  const act = (action: LeadInboxActionName, at?: string, done?: string) =>
    apply(leadActionPatch(action, at), () => runLeadAction(action, [saved.id], at), done);
  const changeStatus = async (status: Lead["status"]) => {
    if (status === lead.status) return;
    setStatusSaved(false);
    if (await apply({ status }, () => setLeadStatus([saved.id], status))) {
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2500);
    }
  };
  const leave = async (action: "trash" | "delete_forever", done: string) => {
    if (action === "delete_forever" && !window.confirm("Delete this lead forever? This cannot be undone.")) return;
    if (await act(action, undefined, done)) router.push(listHref);
  };

  return <header className="leads-header shrink-0 border-b border-[var(--lead-line)] bg-[var(--lead-surface)] px-5 py-3">
    {/* Name and actions share a row; in a narrow pane (Details open) the actions move below the contact line. */}
    <div className="leads-header-grid">
      <div className="leads-header-avatar flex items-center gap-1">
        <Link href={listHref} aria-label="Back to leads" className="leads-icon-button -ml-2 md:hidden"><ArrowLeft size={18} /></Link>
        <Avatar name={name} size={40} />
      </div>
      <h2 className="leads-header-name leads-truncate text-base font-semibold leading-tight">{name}</h2>
      {/* Separators belong to the item after them and are clipped at the start of a line. */}
      <div className="leads-header-meta leads-meta text-[13px] text-[var(--lead-muted)]"><div>
            <span className="leads-meta-item">{email ? <button type="button" title="Copy email" onClick={() => void copy(email, "Email")}
              className="leads-truncate block max-w-full rounded hover:text-[var(--lead-navy)]">{email}</button> : "No email"}</span>
            {phone ? <span className="leads-meta-item flex items-center gap-1">
              {tel ? <a href={tel} className="hover:text-[var(--lead-navy)] hover:underline">{phone}</a> : phone}
              <button type="button" aria-label="Copy phone number" title="Copy phone number" onClick={() => void copy(phone, "Phone number")}
                className="rounded p-0.5 hover:text-[var(--lead-navy)]"><Copy size={12} aria-hidden /></button>
            </span> : null}
            <span className="leads-meta-item leads-truncate">{siteName}</span>
      </div></div>

      <div className="leads-header-actions flex items-center gap-0.5">
        <span role="status" className="mr-1 flex items-center gap-1 text-xs font-medium text-[#0b6238]">
          {statusSaved ? <><Check size={13} aria-hidden />Saved</> : null}</span>
        <Popover label="Lead status" align="end" className="min-w-[170px]" trigger={(props) => <button type="button" {...props} disabled={busy || trashed}
          aria-label={`Status: ${leadStatusLabels[lead.status]}. Change status`} className="mr-1 rounded-full disabled:opacity-60">
          <StatusPill status={lead.status}><ChevronDown size={12} aria-hidden /></StatusPill></button>}>
          {(close) => leadStatuses.map((status) => <MenuItem key={status} checked={lead.status === status} onClick={() => { close(); void changeStatus(status); }}>
            <StatusPill status={status} /></MenuItem>)}
        </Popover>
        {trashed ? null : <>
          <IconButton label={lead.starred ? "Remove star" : "Star"} data-lead-star aria-pressed={Boolean(lead.starred)} className="is-plain" disabled={busy}
            onClick={() => void act(lead.starred ? "unstar" : "star")}>
            <Star size={17} fill={lead.starred ? "#f5b301" : "none"} color={lead.starred ? "#c98f00" : "currentColor"} /></IconButton>
          <IconButton label={lead.archived ? "Unarchive" : "Archive"} data-lead-archive disabled={busy}
            onClick={() => void act(lead.archived ? "unarchive" : "archive", undefined, lead.archived ? "Lead restored to the inbox." : "Lead archived.")}>
            {lead.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}</IconButton>
          <SchedulePopover label="Snooze" title="Hide until" set="Snooze" active={snoozed} disabled={busy} icon={<AlarmClock size={17} />}
            onPick={(at) => void act("snooze", at, "Lead snoozed.")} onClear={snoozed ? () => void act("unsnooze", undefined, "Snooze removed.") : undefined} clearLabel="Unsnooze" />
          <SchedulePopover label="Reminder" title="Remind me" set="Set reminder" active={Boolean(lead.remind_at)} disabled={busy} icon={<Bell size={17} />}
            onPick={(at) => void act("remind", at, "Reminder set.")} onClear={lead.remind_at ? () => void act("clear_reminder", undefined, "Reminder cleared.") : undefined} clearLabel="Clear reminder" />
          <IconButton label={unread ? "Mark read" : "Mark unread"} data-lead-unread disabled={busy} onClick={() => void act(unread ? "read" : "unread")}>
            {unread ? <MailOpen size={17} /> : <Mail size={17} />}</IconButton>
        </>}
        <Popover label="More actions" align="end" trigger={(props) => <IconButton label="More actions" {...props}><Ellipsis size={17} /></IconButton>}>
          {(close) => <>
            <MenuItem role="menuitemcheckbox" aria-checked={showNotes} onClick={() => { close(); onToggleNotes(); }}>
              <StickyNote size={15} aria-hidden />{showNotes ? "Hide notes in thread" : "Show notes in thread"}</MenuItem>
            <a role="menuitem" href={`/dashboard/forms/export?id=${saved.id}`} download className="leads-menu-item" onClick={() => close(false)}>
              <Download size={15} aria-hidden />Export</a>
            {canTrash && !trashed ? <><div className="leads-menu-rule" />
              <MenuItem tone="danger" onClick={() => { close(); void leave("trash", "Lead moved to Trash."); }}><Trash2 size={15} aria-hidden />Move to trash</MenuItem></> : null}
          </>}
        </Popover>
        <IconButton label={detailsOpen ? "Hide details" : "Show details"} tipAlign="end" aria-pressed={detailsOpen} aria-controls={detailsId} onClick={onToggleDetails}>
          <Info size={17} /></IconButton>
      </div>
    </div>

    {trashed ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#fdf3f2] px-3 py-2 text-[13px] text-[#96281f]">
      <Trash2 size={14} aria-hidden /><span className="flex-1">In Trash. Deleted leads are removed for good after 30 days.</span>
      {canTrash ? <>
        <button type="button" className="leads-button" disabled={busy} onClick={() => void act("restore", undefined, "Lead restored.")}><RotateCcw size={14} aria-hidden />Restore</button>
        <button type="button" className="leads-button" data-variant="danger" disabled={busy} onClick={() => void leave("delete_forever", "Lead deleted.")}>Delete forever</button>
      </> : null}
    </div> : snoozed || lead.remind_at || lead.archived ? <div className="mt-2.5 flex flex-wrap items-center gap-2 md:pl-[52px]">
      {lead.archived ? <span className="leads-chip pr-2.5"><Archive size={12} aria-hidden />Archived</span> : null}
      {snoozed && lead.snoozed_until ? <Chip icon={<AlarmClock size={12} aria-hidden />} title={now ? fullDate(lead.snoozed_until) : undefined}
        clear="Remove snooze" disabled={busy} onClear={() => void act("unsnooze", undefined, "Snooze removed.")}>
        {now ? `Snoozed · back ${untilLabel(lead.snoozed_until, now)}` : "Snoozed"}</Chip> : null}
      {lead.remind_at ? <Chip icon={<Bell size={12} aria-hidden />} title={now ? fullDate(lead.remind_at) : undefined}
        clear="Clear reminder" disabled={busy} onClear={() => void act("clear_reminder", undefined, "Reminder cleared.")}>
        {!now ? "Reminder set" : new Date(lead.remind_at).getTime() <= now ? "Reminder due" : `Reminder ${untilLabel(lead.remind_at, now)}`}</Chip> : null}
    </div> : null}
  </header>;
}

function Chip({ icon, title, clear, disabled, onClear, children }: {
  icon: ReactNode; title?: string; clear: string; disabled: boolean; onClear: () => void; children: ReactNode;
}) {
  return <span className="leads-chip" title={title}>
    {icon}{children}
    <button type="button" aria-label={clear} disabled={disabled} onClick={onClear}
      className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-[var(--lead-blue)] hover:bg-[var(--lead-blue-soft)]">
      <X size={11} aria-hidden />Clear</button>
  </span>;
}

function SchedulePopover({ label, title, set, active, disabled, icon, onPick, onClear, clearLabel }: {
  label: string; title: string; set: string; active: boolean; disabled: boolean; icon: ReactNode;
  onPick: (at: string) => void; onClear?: () => void; clearLabel: string;
}) {
  const [custom, setCustom] = useState("");
  return <Popover label={label} role="dialog" align="end" className="w-60"
    trigger={(props) => <IconButton label={label} active={active} disabled={disabled} {...props}>{icon}</IconButton>}>
    {(close) => <>
      <p className="leads-menu-label">{title}</p>
      {([[1, "Tomorrow"], [3, "In 3 days"], [7, "In a week"]] as const).map(([days, text]) =>
        <button key={days} type="button" className="leads-menu-item" onClick={() => { close(); onPick(inDays(days)); }}>{text}</button>)}
      <form className="mt-1 border-t border-[var(--lead-line)] px-2.5 pb-1.5 pt-2.5" onSubmit={(event) => {
        event.preventDefault();
        const date = new Date(custom);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { leadToast("Choose a date and time in the future.", "error"); return; }
        close();
        onPick(date.toISOString());
      }}>
        <label className="block text-xs text-[var(--lead-muted)]">Pick a date and time
          <input type="datetime-local" required value={custom} onChange={(event) => setCustom(event.target.value)} className="leads-input mt-1" /></label>
        <button className="leads-button mt-2 w-full">{set}</button>
      </form>
      {onClear ? <div className="border-t border-[var(--lead-line)] pt-1.5">
        <button type="button" className="leads-menu-item" onClick={() => { close(); onClear(); }}>{clearLabel}</button></div> : null}
    </>}
  </Popover>;
}
