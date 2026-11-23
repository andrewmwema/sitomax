"use client";

import { useId, useState } from "react";
import { Inbox, MailWarning } from "lucide-react";
import type { Lead, LeadEvent } from "@/lib/forms/submissions";
import type { LeadConversation } from "@/lib/leads/conversation";
import { LeadComposer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { LeadDetailsDrawer } from "./details-drawer";
import { LeadThread, type ThreadFocus, type ThreadNote } from "./thread";
import { useLeadMedia, useStored, writeStored } from "./ui";

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
  const mobile = useLeadMedia("(max-width: 767px)");
  const [mobileTab, setMobileTab] = useState<"conversation" | "details" | "notes">("conversation");
  const toggleNotes = () => writeStored(notesKey, showNotes ? "0" : "1");
  const toggleDetails = () => mobile ? setMobileTab(mobileTab === "details" ? "conversation" : "details") : writeStored(detailsKey, detailsOpen ? "0" : "1");

  return <div className="leads-conversation flex min-w-0 flex-1">
    <div className="flex min-w-0 flex-1 flex-col">
      <ConversationHeader lead={lead} siteName={siteName} canTrash={canTrash} canExport={canTrash}
        detailsOpen={mobile ? mobileTab === "details" : detailsOpen} detailsId={detailsId}
        onToggleDetails={toggleDetails} showNotes={showNotes} onToggleNotes={toggleNotes} />
      {mobile ? <div role="tablist" aria-label="Conversation sections" className="leads-conversation-tabs" onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const tabs = ["conversation", "details", "notes"] as const;
        const index = tabs.indexOf(mobileTab);
        const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        setMobileTab(next);
        document.getElementById(`${detailsId}-${next}-tab`)?.focus();
      }}>
        {(["conversation", "details", "notes"] as const).map((tab) => <button key={tab} type="button" role="tab"
          id={`${detailsId}-${tab}-tab`} aria-controls={`${detailsId}-${tab}-panel`} aria-selected={mobileTab === tab}
          tabIndex={mobileTab === tab ? 0 : -1} onClick={() => setMobileTab(tab)}>
          {tab === "conversation" ? "Conversation" : tab === "details" ? "Details" : "Notes"}
          {tab === "notes" && notes?.length ? <span className="ml-1 text-xs">{notes.length}</span> : null}
        </button>)}
      </div> : null}
      <div id={mobile ? `${detailsId}-conversation-panel` : undefined} role={mobile ? "tabpanel" : undefined}
        aria-labelledby={mobile ? `${detailsId}-conversation-tab` : undefined} hidden={mobile && mobileTab !== "conversation"}
        className="leads-thread-section flex min-h-0 flex-1 flex-col">
      <div data-thread-pane className="leads-thread-scroll leads-scroll flex-1 px-5 py-6 sm:px-8">
        {conversation ? <LeadThread lead={lead} siteName={siteName} conversation={conversation} notes={showNotes ? notes ?? [] : []} focus={focus} />
          : <p role="alert" className="mx-auto max-w-[760px] text-sm text-[#96281f]">The reply conversation is unavailable. Refresh the page to try again.</p>}
      </div>
      {conversation ? <div className="leads-reply-bar relative z-20 shrink-0 px-5 pb-5 sm:px-8">
        <div className="mx-auto w-full max-w-[760px]">
          {conversation.composer ? <LeadComposer key={lead.id} config={conversation.composer} /> : <ReplyBlocked blocked={conversation.blocked} />}
        </div>
      </div> : null}
      </div>
      {mobile && mobileTab !== "conversation" ? <div id={`${detailsId}-${mobileTab}-panel`} role="tabpanel"
        aria-labelledby={`${detailsId}-${mobileTab}-tab`} className="flex min-h-0 flex-1">
        <LeadDetailsDrawer key={mobileTab} id={detailsId} lead={lead} siteName={siteName} notes={notes} events={events} showNotes={showNotes}
          mode={mobileTab} onToggleNotes={toggleNotes} onClose={() => setMobileTab("conversation")}
          onOpenNotes={() => setMobileTab("notes")}
          onFocus={(id) => { setMobileTab("conversation"); setFocus((previous) => ({ id, request: (previous?.request ?? 0) + 1 })); }} />
      </div> : null}
    </div>
    {!mobile && detailsOpen ? <LeadDetailsDrawer id={detailsId} lead={lead} siteName={siteName} notes={notes} events={events} showNotes={showNotes}
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
