import Link from "next/link";
import { Inbox, Search, Star } from "lucide-react";
import type { ReactNode } from "react";
import type { Lead } from "@/lib/forms/submissions";
import type { SubmissionSite } from "@/lib/forms/submissions";
import type { LeadInboxCounts, LeadInboxView } from "@/lib/forms/inbox";
import { submissionContact } from "@/lib/forms/submissions";
import { LeadStarButton } from "./lead-controls";
import { RelativeLeadTime } from "./lead-relative-time";

const views: { value: LeadInboxView; label: string }[] = [
  { value: "needs_reply", label: "Needs reply" },
  { value: "waiting", label: "Waiting on customer" },
  { value: "all_open", label: "All open" },
  { value: "starred", label: "Starred" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
  { value: "trash", label: "Trash" },
];

export function LeadsInboxLayout({ rows, allowed, counts, view, search, site, selectedLeadId, conversation, detailBackHref }: {
  rows: Lead[];
  allowed: SubmissionSite[];
  counts: LeadInboxCounts | null;
  view: LeadInboxView;
  search: string;
  site: string;
  selectedLeadId?: string;
  conversation?: ReactNode;
  detailBackHref: string;
}) {
  const list = <section className="min-h-0 border-r border-[var(--platform-line)] bg-[var(--platform-ground)]">
    <form action="/dashboard/leads" className="border-b border-[var(--platform-line)] p-3">
      <input type="hidden" name="view" value={view} />
      {site ? <input type="hidden" name="site" value={site} /> : null}
      <label className="relative block"><span className="sr-only">Search leads</span>
        <Search size={15} className="pointer-events-none absolute top-3 left-3 text-[var(--platform-muted)]" />
        <input name="q" type="search" maxLength={200} defaultValue={search} placeholder="Search leads…" className="w-full border py-2 pl-9 pr-3 text-sm" />
      </label>
    </form>
    <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
      {rows.map((lead) => {
        const contact = submissionContact(lead.data);
        const name = contact.name || "Form submission";
        const preview = lead.last_message_preview || (lead.last_message_direction === "out" ? "Team replied" : contact.email || lead.form_name || "New inquiry");
        const href = `/dashboard/leads/${lead.id}?view=${encodeURIComponent(view)}${search ? `&q=${encodeURIComponent(search)}` : ""}${site ? `&site=${encodeURIComponent(site)}` : ""}`;
        return <article key={lead.id} className={`group border-b border-[var(--platform-line)] px-3 py-3 ${selectedLeadId === lead.id ? "bg-[var(--platform-subtle)]" : "hover:bg-[var(--platform-subtle)]"}`}>
          <div className="flex items-start gap-2">
            <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${lead.unread || lead.has_unread_reply || !lead.is_read ? "bg-[var(--platform-accent)]" : "bg-transparent"}`} />
            <Link href={href} className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`${lead.unread || lead.has_unread_reply || !lead.is_read ? "font-bold" : "font-semibold"} truncate text-sm`}>{name}</span>
                <RelativeLeadTime value={lead.last_message_at || lead.last_activity_at} />
              </div>
              <p className="mt-1 truncate text-xs text-[var(--platform-muted)]">{preview}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--platform-muted)]">
                <span className="truncate">{allowed.find((item) => item.id === lead.site_id)?.name || allowed.find((item) => item.id === lead.site_id)?.subdomain || "Website"}</span>
                <span className="platform-status" data-tone={lead.status === "new" ? "accent" : undefined}>{lead.status}</span>
              </div>
            </Link>
            <LeadStarButton lead={lead} />
          </div>
        </article>;
      })}
      {!rows.length ? <div className="p-8 text-center"><Inbox size={24} className="mx-auto text-[var(--platform-muted)]" />
        <p className="mt-3 text-sm font-semibold">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">No leads match this view.</p>
      </div> : null}
    </div>
  </section>;

  const sidebar = <aside className="hidden border-r border-[var(--platform-line)] bg-[var(--platform-ground)] xl:block">
    <div className="p-3"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--platform-muted)]">Inbox</p></div>
    <nav aria-label="Lead views" className="space-y-1 px-2">
      {views.map((item) => <Link key={item.value} href={`/dashboard/leads?view=${item.value}${site ? `&site=${encodeURIComponent(site)}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
        aria-current={view === item.value ? "page" : undefined}
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${view === item.value ? "bg-[var(--platform-subtle)] font-semibold" : "text-[var(--platform-muted)] hover:bg-[var(--platform-subtle)]"}`}>
        <span>{item.label}</span>
        {counts ? <span className="text-xs">{counts[item.value === "all_open" ? "all_open" : item.value] ?? 0}</span> : null}
      </Link>)}
    </nav>
  </aside>;

  const mobileList = selectedLeadId ? null : list;
  const mobileDetail = selectedLeadId ? <section className="min-h-[calc(100vh-10rem)] bg-[var(--platform-ground)]">
    <Link href={detailBackHref} className="block border-b border-[var(--platform-line)] px-4 py-3 text-sm">← Back to leads</Link>
    {conversation}
  </section> : null;

  return <>
    <div className="md:hidden">{mobileDetail || mobileList}</div>
    <div className="hidden h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-[var(--platform-line)] bg-[var(--platform-ground)] md:grid md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[180px_340px_minmax(0,1fr)]">
      {sidebar}
      {list}
      <section className="min-w-0 overflow-y-auto">{conversation || <div className="flex h-full items-center justify-center p-8 text-center">
        <div><Star size={24} className="mx-auto text-[var(--platform-muted)]" /><p className="mt-3 text-sm font-semibold">Select a lead</p>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">Choose a conversation to read and reply.</p></div>
      </div>}</section>
    </div>
  </>;
}
