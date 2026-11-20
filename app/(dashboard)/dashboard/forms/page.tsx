import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Download, Inbox, Percent, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { WorkspaceMetrics } from "@/components/dashboard/workspace-metrics";
import { MarkSubmissionRead } from "@/components/dashboard/mark-submission-read";
import { CopyLeadValue, LeadBulkForm, LeadDrawer, LeadNoteForm, LeadStatusForm } from "@/components/dashboard/lead-controls";
import { allowedLeadSites, getSubmissionPage, LEAD_COLUMNS, SUBMISSION_PAGE_SIZE } from "@/lib/forms/queries";
import { leadStatuses, leadStatusLabels, submissionContact, submissionFiltersSchema, submissionQueryString,
  type Lead, type LeadEvent, type LeadNote } from "@/lib/forms/submissions";
import { TableScrollArea } from "@/components/dashboard/table-scroll-area";
import { z } from "zod";
import { LeadReplyThread } from "./reply-thread";

const route = "/dashboard/forms";
const statsSchema = z.object({ received: z.number(), awaiting: z.number(), won_month: z.number(), won: z.number(), lost: z.number() });
const displayDate = (date: string) => new Date(date).toLocaleString("en", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});
const eventLabels = { created: "Lead received", status_changed: "Status changed", note_added: "Note added",
  email_sent: "Email sent", reply_received: "Reply received" };

export default function FormsPage({ searchParams }: PageProps<"/dashboard/forms">) {
  return <section className="flex flex-col gap-6">
    <header><p className="platform-eyebrow mb-1">Operations · Forms &amp; Submissions</p>
      <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Track and organize inquiries from your websites.</p></header>
    <Suspense fallback={<div role="status" aria-label="Loading leads" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}>
      <FormsContent searchParams={searchParams} />
    </Suspense>
  </section>;
}

async function FormsContent({ searchParams }: { searchParams: PageProps<"/dashboard/forms">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const parsed = submissionFiltersSchema.extend({ lead: z.uuid().optional() }).safeParse(params);
  if (!parsed.success) return <p role="alert" className="text-sm text-[var(--platform-error)]">Choose valid filters and keep searches under 200 characters.</p>;
  const filters = parsed.data;
  const allowed = await allowedLeadSites(supabase, user.id);
  if (filters.site && !allowed.some((site) => site.id === filters.site)) return <p role="alert">This site is unavailable or you do not have permission to view its leads.</p>;
  if (!allowed.length) return <div className="platform-panel p-8 text-center"><Inbox size={24} className="mx-auto text-[var(--platform-muted)]" />
    <h2 className="mt-3 text-sm font-semibold">Your website inquiries, in one place</h2>
    <p className="mt-2 text-sm text-[var(--platform-muted)]">Leads are available to account owners for their websites.</p>
    <Link href="/dashboard/sites" className="platform-button mt-4">View websites</Link>
  </div>;
  const siteName = (id: string) => {
    const site = allowed.find((value) => value.id === id);
    return site?.name || site?.subdomain || "Website";
  };
  const [results, statsResult, detail] = await Promise.all([
    getSubmissionPage(supabase, allowed, filters, new Date()),
    supabase.rpc("lead_inbox_stats", { p_site_id: filters.site || null }),
    filters.lead ? supabase.from("form_submissions").select(LEAD_COLUMNS).eq("id", filters.lead).maybeSingle<Lead>() : null,
  ]);
  if (detail?.error) throw new Error("Could not load this lead.");
  const parsedStats = statsSchema.safeParse(statsResult.data);
  const stats = statsResult.error || !parsedStats.success ? null : parsedStats.data;
  const closed = stats ? stats.won + stats.lost : 0;
  const pages = Math.max(1, Math.ceil(results.count / SUBMISSION_PAGE_SIZE));
  const query = submissionQueryString(filters, filters.page);
  const closeHref = `${route}${query}`;
  const archived = filters.archived === "1";
  return <>
    <WorkspaceMetrics metrics={[
      { label: "New this week", value: stats?.received ?? "Unavailable", detail: "Received since Monday · UTC", icon: Inbox },
      { label: "Awaiting reply", value: stats?.awaiting ?? "Unavailable", detail: "Active, still new after 24 hours", icon: Clock },
      { label: "Won this month", value: stats?.won_month ?? "Unavailable", detail: "Marked won this calendar month · UTC", icon: CalendarDays },
      { label: "Win rate", value: !stats ? "Unavailable" : closed ? `${Math.round(stats.won / closed * 100)}%` : "—",
        detail: "Won ÷ all won or lost leads", icon: Percent },
    ]} />
    <section aria-label="Lead inbox" className="platform-panel overflow-hidden">
      <div className="px-4 pt-3">
        <nav className="platform-tabs" aria-label="Lead status quick filters">
          {[...leadStatuses, "all" as const].map((status) => <Link key={status} aria-current={filters.status === status ? "page" : undefined}
            href={`${route}${submissionQueryString({ ...filters, status })}`}>{status === "all" ? "All" : leadStatusLabels[status]}</Link>)}
        </nav>
      </div>
      <form key={submissionQueryString(filters)} action={route} className="flex flex-wrap items-end gap-3 border-b border-[var(--platform-line)] p-4">
        {filters.status !== "all" ? <input type="hidden" name="status" value={filters.status} /> : null}
        <label className="relative min-w-48 flex-1"><span className="sr-only">Search leads</span><Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-[var(--platform-muted)]" />
          <input type="search" name="q" maxLength={200} defaultValue={filters.q} placeholder="Search name, email or message…" className="w-full border py-2 pl-9 pr-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Website
          <select name="site" defaultValue={filters.site} className="max-w-52 border px-3 text-sm">
            <option value="">All websites</option>{allowed.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Date range
          <select name="days" defaultValue={filters.days} className="border px-3 text-sm"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Inbox
          <select name="archived" defaultValue={filters.archived} className="border px-3 text-sm"><option value="0">Active</option><option value="1">Archived</option></select></label>
        <button className="platform-button platform-button-primary">Apply filters</button>
        <Link href={route} className="platform-button">Reset</Link>
        <a href={`${route}/export${submissionQueryString(filters)}`} className="platform-button"><Download size={14} />Export CSV</a>
      </form>
      <p className="px-4 pt-3 text-xs text-[var(--platform-muted)]">{results.count.toLocaleString("en")} matching {results.count === 1 ? "lead" : "leads"} · Export CSV includes every match</p>
      {results.rows.length ? <>
        <LeadBulkForm archived={archived} />
        <TableScrollArea label="Leads"><table className="w-full min-w-[790px] text-left text-sm">
          <thead><tr>{["Select", "Contact", "Source", "Status", "Received (UTC)", "Last activity (UTC)"].map((heading) =>
            <th key={heading} scope="col" className="px-4 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{results.rows.map((row) => {
            const contact = submissionContact(row.data);
            const name = contact.name || "Form submission";
            return <tr key={row.id} className="align-top">
              <td className="px-4"><input type="checkbox" name="id" value={row.id} form="lead-bulk" aria-label={`Select ${name}, received ${displayDate(row.created_at)} UTC`} /></td>
              <td className="max-w-56 break-words px-4">
                <Link scroll={false} href={`${closeHref}${query ? "&" : "?"}lead=${row.id}`} className="font-semibold hover:underline">{name}</Link>
                <div className="text-xs text-[var(--platform-muted)]">{[contact.email, contact.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
              </td>
              <td className="max-w-52 break-words px-4">{siteName(row.site_id)}
                <div className="text-xs text-[var(--platform-muted)]">{row.form_name || "Form"} · {row.page_path || "/"}</div></td>
              <td className="px-4"><span className="platform-status" data-tone={row.status === "new" ? "accent" : undefined}>{leadStatusLabels[row.status]}</span>
                {row.has_unread_reply ? <span className="mt-1 flex items-center gap-1 text-xs"><span aria-hidden className="size-2 rounded-full bg-[var(--platform-accent)]" />Unread reply</span>
                  : !row.is_read ? <span className="mt-1 block text-xs text-[var(--platform-muted)]">Unread</span> : null}
              </td>
              <td className="px-4 text-xs text-[var(--platform-muted)]">{displayDate(row.created_at)}</td>
              <td className="px-4 text-xs text-[var(--platform-muted)]">{displayDate(row.last_activity_at)}</td>
            </tr>;
          })}</tbody>
        </table></TableScrollArea>
      </> : <div className="p-8 text-center"><Inbox size={24} className="mx-auto text-[var(--platform-muted)]" />
        <h2 className="mt-3 text-sm font-semibold">No leads match these filters</h2>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">Try different filters, or publish a form to start collecting inquiries.</p>
      </div>}
      {pages > 1 || filters.page > 1 ? <nav aria-label="Lead pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--platform-line)] px-5 py-3">
        {filters.page > 1 ? <Link href={`${route}${submissionQueryString(filters, Math.min(filters.page - 1, pages))}`} className="platform-button">Previous</Link> : <span />}
        <span className="text-xs text-[var(--platform-muted)]">Page {filters.page} of {pages}</span>
        {filters.page < pages ? <Link href={`${route}${submissionQueryString(filters, filters.page + 1)}`} className="platform-button">Next</Link> : <span />}
      </nav> : null}
    </section>
    {detail?.data ? <LeadDetails key={detail.data.id} lead={detail.data} siteName={siteName(detail.data.site_id)} closeHref={closeHref} supabase={supabase} userId={user.id} />
      : filters.lead ? <p role="alert">That lead is unavailable or you do not have permission to view it.</p> : null}
  </>;
}

async function LeadDetails({ lead, siteName, closeHref, supabase, userId }: {
  lead: Lead; siteName: string; closeHref: string; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]; userId: string;
}) {
  const [notes, events] = await Promise.all([
    supabase.from("lead_notes").select("id, author_id, body, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadNote[]>(),
    supabase.from("lead_events").select("id, type, data, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadEvent[]>(),
  ]);
  const contact = submissionContact(lead.data);
  const email = z.email().safeParse(contact.email?.trim());
  const phone = contact.phone?.trim().replace(/[\s().-]/g, "");
  const tel = phone && /^\+?[0-9]{3,20}$/.test(phone) ? `tel:${phone}` : null;
  return <LeadDrawer title={contact.name || "Lead details"} description={`${siteName} · ${lead.form_name || "Form"} · ${lead.page_path || "/"}`} closeHref={closeHref}>
    <section className="space-y-2 border-b border-[var(--platform-line)] pb-4">
      <p className="text-xs text-[var(--platform-muted)]">Received {displayDate(lead.created_at)} UTC</p>
      {contact.email ? <div className="flex flex-wrap items-center gap-2 break-all text-sm">
        {email.success ? <a className="underline" href={`mailto:${encodeURIComponent(email.data)}`}>{contact.email}</a> : <span>{contact.email}</span>}
        <CopyLeadValue value={contact.email} label="Email" />
      </div> : null}
      {contact.phone ? <div className="flex flex-wrap items-center gap-2 text-sm">
        {tel ? <a className="underline" href={tel}>{contact.phone}</a> : <span>{contact.phone}</span>}<CopyLeadValue value={contact.phone} label="Phone" />
      </div> : null}
      <LeadStatusForm lead={lead} />
      {!lead.is_read || lead.has_unread_reply ? <MarkSubmissionRead id={lead.id} /> : null}
    </section>
    <LeadReplyThread lead={lead} supabase={supabase} />
    <section className="space-y-3"><h3 className="text-sm font-semibold">Internal notes</h3>
      <LeadNoteForm leadId={lead.id} siteId={lead.site_id} />
      {notes.error ? <p role="alert" className="text-sm">Notes are unavailable.</p> : notes.data.map((note) => <article key={note.id} className="platform-panel space-y-2 p-3">
        <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
        <p className="text-xs text-[var(--platform-muted)]">{displayDate(note.created_at)} UTC {note.author_id === userId ? "· Your note" : ""}</p>
        {note.author_id === userId ? <details><summary className="cursor-pointer text-sm">Edit or delete</summary>
          <LeadNoteForm key={note.body} leadId={lead.id} siteId={lead.site_id} note={note} /></details> : null}
      </article>)}
    </section>
    <section><h3 className="text-sm font-semibold">Timeline</h3>
      {events.error ? <p role="alert" className="mt-2 text-sm">The timeline is unavailable.</p> : <ol className="divide-y divide-[var(--platform-line)]">
        {events.data.map((event) => {
          const to = leadStatuses.find((status) => status === event.data?.to);
          const from = leadStatuses.find((status) => status === event.data?.from);
          return <li key={event.id} className="py-2 text-sm">{eventLabels[event.type]}{from && to ? `: ${leadStatusLabels[from]} → ${leadStatusLabels[to]}` : ""}
            <div className="text-xs text-[var(--platform-muted)]">{displayDate(event.created_at)} UTC</div></li>;
        })}
      </ol>}
    </section>
  </LeadDrawer>;
}
