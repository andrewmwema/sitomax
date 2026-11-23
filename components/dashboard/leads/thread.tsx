"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, CheckCheck, CircleAlert, Clock, Ellipsis, FileText, StickyNote, TriangleAlert } from "lucide-react";
import { submissionContact, submissionFields, type Lead } from "@/lib/forms/submissions";
import type { LeadConversation, LeadThreadMessage } from "@/lib/leads/conversation";
import { MarkLeadViewed } from "@/components/dashboard/mark-lead-viewed";
import { dayKey, dayLabel, leadDisplayName, leadIsUnread } from "./format";
import { Avatar, copyLeadValue, useHydrated, useNow } from "./ui";

export type ThreadNote = { id: string; body: string; created_at: string; mine: boolean };
export type ThreadFocus = { id: string; request: number };
type Item = { at: string; key: string } & ({ kind: "form" } | { kind: "message"; message: LeadThreadMessage } | { kind: "note"; note: ThreadNote });

const RECENT = 5;
const elementId = (id: string) => id === "form" || id.startsWith("note-") ? `thread-${id}` : `message-${id}`;
const fieldLabel = (field: string) => {
  const text = field.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function LeadThread({ lead, siteName, conversation, notes = [], focus }: {
  lead: Lead; siteName: string; conversation: LeadConversation;
  /** Internal notes to show inline; leave empty to keep the thread to emails only. */
  notes?: ThreadNote[];
  /** Brings a message or note into view, expanding earlier messages when needed. */
  focus?: ThreadFocus | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const opened = useRef<{ leadId: string; selectedId: string | null } | null>(null);
  // Viewing marks a lead read once per visit, so "Mark unread" sticks until it is opened again.
  const [openedUnread] = useState(() => leadIsUnread(lead));
  const hydrated = useHydrated();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const { messages } = conversation;
  const target = focus?.id ?? conversation.selectedId;
  const hiddenCount = Math.max(0, messages.length - RECENT);
  const firstRecent = hiddenCount > 0 ? Date.parse(messages[hiddenCount].createdAt) : null;
  const isEarlier = (item: Item) => item.kind !== "form" && firstRecent !== null && Date.parse(item.at) < firstRecent;
  const items: Item[] = [
    { kind: "form" as const, at: lead.created_at, key: "form" },
    ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, key: `message-${message.id}`, message })),
    ...notes.map((note) => ({ kind: "note" as const, at: note.created_at, key: `note-${note.id}`, note })),
  ].sort((a, b) => a.kind === "form" ? -1 : b.kind === "form" ? 1 : Date.parse(a.at) - Date.parse(b.at));
  const matches = (item: Item, id: string | null | undefined) => item.key === id || (item.kind === "message" && item.message.id === id);
  const targetItem = items.find((item) => matches(item, target));
  const showEarlier = expanded || Boolean(targetItem && isEarlier(targetItem));
  const visible = (showEarlier ? items : items.filter((item) => !isEarlier(item))).map((item, index, list) => ({
    item,
    // Local dates are only known in the browser, so separators appear once hydrated.
    separator: hydrated && now && (index === 0 || dayKey(list[index - 1].at) !== dayKey(item.at)) ? dayLabel(item.at, now) : null,
  }));
  const name = leadDisplayName(lead.data);
  const selectedId = conversation.selectedId;
  const newestId = messages.at(-1)?.id;

  useLayoutEffect(() => {
    const pane = root.current?.closest<HTMLElement>("[data-thread-pane]");
    if (!pane) return;
    const track = () => { atBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80; };
    pane.addEventListener("scroll", track, { passive: true });
    return () => pane.removeEventListener("scroll", track);
  }, []);

  // Follow incoming messages only when the reader was already at the bottom.
  useLayoutEffect(() => {
    if (!hydrated) return;
    const selected = selectedId ? document.getElementById(elementId(selectedId)) : null;
    const pane = root.current?.closest<HTMLElement>("[data-thread-pane]");
    const opening = opened.current?.leadId !== lead.id;
    if (selected && (opening || opened.current?.selectedId !== selectedId)) selected.scrollIntoView({ block: "start" });
    else if (pane && (opening || atBottom.current)) pane.scrollTop = pane.scrollHeight;
    opened.current = { leadId: lead.id, selectedId };
  }, [lead.id, messages.length, newestId, hydrated, selectedId]);
  useLayoutEffect(() => {
    if (focus) document.getElementById(elementId(focus.id))?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  return <div ref={root} className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
    {openedUnread || lead.has_unread_reply ? <MarkLeadViewed id={lead.id} lastActivity={lead.last_activity_at} /> : null}
    {conversation.selectedMissing ? <p role="alert" className="text-sm text-[#96281f]">That message is unavailable.</p> : null}
    <ol className="flex flex-col gap-3">
      {visible.map(({ item, separator }, index) => {
        const flash = focus && matches(item, focus.id) ? focus.request : 0;
        return <li key={`${item.key}:${flash}`} className="flex flex-col gap-3">
          {separator ? <div className="flex items-center gap-3 py-1 text-xs font-medium text-[var(--lead-muted)]" role="separator" aria-label={separator}>
            <span className="h-px flex-1 bg-[var(--lead-line)]" />{separator}<span className="h-px flex-1 bg-[var(--lead-line)]" />
          </div> : null}
          {item.kind === "form" ? <FormCard lead={lead} name={name} siteName={siteName} flash={Boolean(flash)} />
            : item.kind === "note" ? <NoteCard note={item.note} flash={Boolean(flash)} />
            : <MessageCard message={item.message} via={conversation.via} flash={Boolean(flash)} />}
          {index === 0 && hiddenCount > 0 && !showEarlier ? <button type="button" onClick={() => setExpanded(true)}
            className="mx-auto rounded-full border border-[var(--lead-line)] bg-[var(--lead-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--lead-body)] hover:bg-[var(--lead-hover)]">
            Show {hiddenCount} earlier message{hiddenCount === 1 ? "" : "s"}
          </button> : null}
        </li>;
      })}
    </ol>
    {conversation.truncated ? <p className="text-center text-xs text-[var(--lead-muted)]">Showing the latest 100 emails.</p> : null}
    {conversation.notice ? <p className="text-center text-xs text-[var(--lead-muted)]">{conversation.notice}</p> : null}
  </div>;
}

function MessageTime({ value }: { value: string }) {
  const hydrated = useHydrated();
  const date = new Date(value);
  if (!hydrated || Number.isNaN(date.getTime())) return <time dateTime={value} className="shrink-0 text-xs text-[var(--lead-muted)]" />;
  return <time dateTime={value} title={date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })} className="shrink-0 text-xs tabular-nums text-[var(--lead-muted)]">
    {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
  </time>;
}

function FormCard({ lead, name, siteName, flash }: { lead: Lead; name: string; siteName: string; flash: boolean }) {
  const fields = submissionFields(lead.data);
  const contact = submissionContact(lead.data);
  const dial = contact.phone?.replace(/[\s().-]/g, "");
  const tel = dial && /^\+?[0-9]{3,20}$/.test(dial) ? `tel:${dial}` : null;
  return <article id="thread-form" className="leads-card scroll-mt-4 p-5" data-flash={flash} aria-label="Form submission">
    <header className="flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--lead-blue-soft)] text-[var(--lead-blue)]"><FileText size={15} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--lead-navy)]">Form submission</p>
        <p className="truncate text-xs text-[var(--lead-muted)]">{name} · {lead.form_name || "Form"} on {siteName}{lead.page_path ? ` · ${lead.page_path}` : ""}</p>
      </div>
      <MessageTime value={lead.created_at} />
    </header>
    {fields.length ? <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(96px,160px)_minmax(0,1fr)]">
      {fields.map(([field, value]) => <div key={field} className="contents">
        <dt className="break-words text-[13px] text-[var(--lead-muted)]">{fieldLabel(field)}</dt>
        <dd className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--lead-body)]">
          {typeof value === "string" && value === contact.email ? <button type="button" title="Copy email" className="leads-contact-value text-left text-[var(--lead-blue)] underline"
            onClick={() => void copyLeadValue(value, "Email")}>{value}</button>
            : typeof value === "string" && value === contact.phone && tel ? <a href={tel} className="leads-contact-value text-[var(--lead-blue)] underline">{value}</a>
            : typeof value === "string" ? value : JSON.stringify(value)}
        </dd>
      </div>)}
    </dl> : <p className="mt-4 text-sm text-[var(--lead-muted)]">No details were submitted.</p>}
  </article>;
}

function NoteCard({ note, flash }: { note: ThreadNote; flash: boolean }) {
  return <article id={`thread-note-${note.id}`} data-flash={flash} aria-label="Internal note"
    className="leads-card scroll-mt-4 border-[#f0e2a6] bg-[#fffbea] px-4 py-3">
    <header className="flex items-center gap-2 text-xs font-medium text-[#6b5200]">
      <StickyNote size={13} aria-hidden /><span className="flex-1">Internal note{note.mine ? " · You" : ""}</span><MessageTime value={note.created_at} />
    </header>
    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-[#4a3a00]">{note.body}</p>
  </article>;
}

const deliveryIcons = { Delivered: CheckCheck, Sent: Check, Bounced: TriangleAlert, Sending: Clock } as const;

function MessageCard({ message, via, flash }: { message: LeadThreadMessage; via: string; flash: boolean }) {
  const [quoted, setQuoted] = useState(false);
  const ours = message.direction === "out";
  const hasQuote = Boolean(message.quoteHtml || message.quoteText);
  const DeliveryIcon = message.delivery ? deliveryIcons[message.delivery.label as keyof typeof deliveryIcons] ?? CircleAlert : null;
  const body = <>
    <div className="leads-rich" dangerouslySetInnerHTML={{ __html: message.html }} />
    {hasQuote ? <button type="button" aria-expanded={quoted} aria-label={quoted ? "Hide quoted text" : "Show quoted text"} onClick={() => setQuoted(!quoted)}
      className="mt-3 flex h-5 w-8 items-center justify-center rounded-full bg-[#eceff6] text-[var(--lead-muted)] hover:bg-[#dfe3ee] hover:text-[var(--lead-navy)]">
      <Ellipsis size={16} aria-hidden />
    </button> : null}
    {quoted && message.quoteHtml ? <div className="leads-rich mt-3" data-muted="true" dangerouslySetInnerHTML={{ __html: message.quoteHtml }} /> : null}
    {quoted && message.quoteText ? <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-[var(--lead-line)] pl-3 text-[13px] text-[var(--lead-muted)]">{message.quoteText}</p> : null}
    {message.hasAttachments ? <p className="mt-3 text-xs text-[var(--lead-muted)]">Attachments are not shown.</p> : null}
  </>;
  return <article id={`message-${message.id}`} data-flash={flash} aria-label={`Email from ${message.sender}`}
    className={`leads-card scroll-mt-4 p-5 ${ours ? "bg-[#f8faff]" : ""}`}>
    <header className="flex items-center gap-3">
      <Avatar name={message.sender} size={32} />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold text-[var(--lead-navy)]">{message.sender}</span>
        {ours ? <span className="text-[var(--lead-muted)]"> via {via}</span> : null}
      </p>
      <MessageTime value={message.createdAt} />
    </header>
    <div className="mt-3 sm:pl-11">
      {message.autoReply ? <details>
        <summary className="cursor-pointer text-sm text-[var(--lead-muted)]">Automatic reply: {message.subject}</summary>
        <div className="mt-3">{body}</div>
      </details> : <>
        {message.showSubject ? <p className="mb-2 break-words text-sm font-semibold text-[var(--lead-navy)]">{message.subject}</p> : null}
        {body}
      </>}
      {message.forwardIssue ? <p role="status" className="mt-3 text-xs text-[#96281f]">{message.forwardIssue}</p> : null}
      {message.delivery && DeliveryIcon ? <p className={`mt-3 flex items-center gap-1.5 text-xs ${message.delivery.tone === "error" ? "text-[#96281f]"
        : message.delivery.label === "Delivered" ? "text-[#0b6238]" : "text-[var(--lead-muted)]"}`}>
        <DeliveryIcon size={13} aria-hidden />{message.delivery.label}
        {message.delivery.at ? <> · <MessageTime value={message.delivery.at} /></> : null}
      </p> : null}
    </div>
  </article>;
}
