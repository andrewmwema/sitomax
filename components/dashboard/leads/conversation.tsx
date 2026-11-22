"use client";

import { useId, useState } from "react";
import { Inbox, MailWarning } from "lucide-react";
import type { Lead, LeadEvent } from "@/lib/forms/submissions";
import type { LeadConversation } from "@/lib/leads/conversation";
import { LeadComposer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { LeadDetailsDrawer } from "./details-drawer";
import { LeadThread, type ThreadFocus, type ThreadNote } from "./thread";
import { useStored, writeStored } from "./ui";

export function LeadConversationView({ lead, siteName, canTrash, userId, conversation, notes, events }: {
  lead: Lead; siteName: string; canTrash: boolean; userId: string;
  /** Null when the emails could not be loaded. */
  conversation: LeadConversation | null;
  notes: ThreadNote[] | null; events: LeadEvent[] | null;
}) {
  const detailsKey = `sitomax:leads:details:${userId}`;
  const notesKey = `sitomax:leads:notes-in-thread:${userId}`;
  const detailsOpen = useStored(detailsKey) === "1";
  const showNotes = useStored(notesKey) === "1";
  const [focus, setFocus] = useState<ThreadFocus | null>(null);
  const detailsId = useId();
  const toggleNotes = () => writeStored(notesKey, showNotes ? "0" : "1");

  return <div className="flex min-w-0 flex-1">
    <div className="flex min-w-0 flex-1 flex-col">
      <ConversationHeader lead={lead} siteName={siteName} canTrash={canTrash} detailsOpen={detailsOpen} detailsId={detailsId}
        onToggleDetails={() => writeStored(detailsKey, detailsOpen ? "0" : "1")} showNotes={showNotes} onToggleNotes={toggleNotes} />
      <div data-thread-pane className="leads-scroll flex-1 px-5 py-6 sm:px-8">
        {conversation ? <LeadThread lead={lead} siteName={siteName} conversation={conversation} notes={showNotes ? notes ?? [] : []} focus={focus} />
          : <p role="alert" className="mx-auto max-w-[760px] text-sm text-[#96281f]">The reply conversation is unavailable. Refresh the page to try again.</p>}
      </div>
      {conversation ? <div className="relative z-20 shrink-0 px-5 pb-5 sm:px-8">
        <div className="mx-auto w-full max-w-[760px]">
          {conversation.composer ? <LeadComposer key={lead.id} config={conversation.composer} /> : <ReplyBlocked blocked={conversation.blocked} />}
        </div>
      </div> : null}
    </div>
    {detailsOpen ? <LeadDetailsDrawer id={detailsId} lead={lead} siteName={siteName} notes={notes} events={events} showNotes={showNotes}
      onToggleNotes={toggleNotes} onClose={() => writeStored(detailsKey, "0")}
      onFocus={(id) => setFocus((previous) => ({ id, request: (previous?.request ?? 0) + 1 }))} /> : null}
  </div>;
}

export function ReplyBlocked({ blocked }: { blocked: LeadConversation["blocked"] }) {
  if (!blocked) return null;
  return <div role="status" className="leads-card flex items-start gap-3 px-4 py-3 text-sm text-[var(--lead-body)]">
    <MailWarning size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--lead-muted)]" />
    <p className="min-w-0 flex-1">{blocked.message}{blocked.detail ? <span className="mt-0.5 block text-xs text-[var(--lead-muted)]">{blocked.detail}</span> : null}</p>
  </div>;
}

export function ConversationSkeleton() {
  return <div className="flex min-w-0 flex-1 flex-col" role="status" aria-label="Loading conversation">
    <div className="flex items-center gap-3 border-b border-[var(--lead-line)] bg-[var(--lead-surface)] px-5 py-3">
      <div className="leads-skeleton size-10 rounded-full" />
      <div className="flex-1 space-y-2"><div className="leads-skeleton h-4 w-40" /><div className="leads-skeleton h-3 w-64" /></div>
    </div>
    <div className="mx-auto w-full max-w-[760px] flex-1 space-y-3 px-5 py-6 sm:px-0">
      {[120, 88, 104].map((height) => <div key={height} className="leads-card p-5"><div className="leads-skeleton w-full" style={{ height }} /></div>)}
    </div>
  </div>;
}

export function ConversationEmpty() {
  return <div className="flex flex-1 items-center justify-center p-8 text-center">
    <div>
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--lead-surface)] text-[var(--lead-muted)] shadow-[0_1px_3px_rgb(21_24_41/8%)]">
        <Inbox size={22} aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-[var(--lead-navy)]">Select a lead</p>
      <p className="mt-1 text-[13px] text-[var(--lead-muted)]">Choose a conversation from the list to read it and reply.</p>
    </div>
  </div>;
}
