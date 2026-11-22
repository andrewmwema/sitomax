import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { allowedLeadSites, getSubmissionPage, LEAD_COLUMNS } from "@/lib/forms/queries";
import { leadMatchesInboxView, leadInboxViews, type LeadInboxCounts, type LeadInboxViewRow } from "@/lib/forms/inbox";
import { leadStatusLabels, submissionContact, submissionFiltersSchema, type Lead, type LeadEvent, type LeadNote } from "@/lib/forms/submissions";
import { LeadsInboxLayout } from "@/components/dashboard/leads-inbox-layout";
import { LeadInboxHeaderActions, LeadNoteForm, LeadStatusForm, CopyLeadValue } from "@/components/dashboard/lead-controls";
import { LeadInboxTabs } from "@/components/dashboard/lead-inbox-tabs";
import { LeadReplyThread } from "@/app/(dashboard)/dashboard/forms/reply-thread";
import { LocalTime } from "@/components/dashboard/local-time";

export default async function LeadConversationPage({ params, searchParams }: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leadId } = await params;
  const parsedId = z.uuid().safeParse(leadId);
  if (!parsedId.success) return <p role="alert">That lead is unavailable.</p>;
  const { supabase, user } = await requireUser();
  const rawParams = await searchParams;
  const parsed = z.object({
    view: z.enum(leadInboxViews).default("needs_reply"),
    q: z.string().trim().max(200).default(""),
    site: z.union([z.literal(""), z.uuid()]).default(""),
  }).safeParse(rawParams);
  if (!parsed.success) return <p role="alert">Choose a valid lead view or search.</p>;
  const { view, q, site } = parsed.data;
  const [allowed, detailResult] = await Promise.all([
    allowedLeadSites(supabase, user.id),
    supabase.from("form_submissions").select(LEAD_COLUMNS).eq("id", parsedId.data).maybeSingle<Lead>(),
  ]);
  if (detailResult.error) throw new Error("Could not load this lead.");
  if (!detailResult.data) return <p role="alert">That lead is unavailable or you do not have permission to view it.</p>;
  const lead = detailResult.data;

  const countsResult = await supabase.rpc("lead_inbox_counts", { p_site_id: site || null });
  const counts = z.object({
    needs_reply: z.number(), waiting: z.number(), all_open: z.number(), starred: z.number(),
    won: z.number(), lost: z.number(), archived: z.number(), trash: z.number(),
  }).safeParse(countsResult.data);
  const rpc = await supabase.rpc("lead_inbox_view", {
    p_view: view, p_site_id: site || null, p_search: q || null,
    p_cursor_at: null, p_cursor_id: null, p_limit: 100,
  });
  let rows: Lead[] = [];
  if (!rpc.error && Array.isArray(rpc.data)) rows = rpc.data as Lead[];
  else {
    const fallbackFilters = submissionFiltersSchema.parse({
      site, q, page: 1, days: "all", status: "all", archived: view === "archived" ? "1" : "0",
    });
    const result = await getSubmissionPage(supabase, allowed, fallbackFilters, new Date());
    rows = result.rows.filter((row) => leadMatchesInboxView({
      status: row.status, starred: row.starred ?? false,
      archived_at: row.archived_at ?? (row.archived ? row.created_at : null),
      deleted_at: row.deleted_at ?? null, snoozed_until: row.snoozed_until ?? null,
      last_message_direction: row.last_message_direction ?? null,
    } satisfies LeadInboxViewRow, view));
  }
  if (!rows.some((row) => row.id === lead.id)) {
    rows = [lead, ...rows.filter((row) => row.id !== lead.id)];
  }

  const [notes, events] = await Promise.all([
    supabase.from("lead_notes").select("id, author_id, body, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadNote[]>(),
    supabase.from("lead_events").select("id, type, data, created_at").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).order("id").returns<LeadEvent[]>(),
  ]);
  const contact = submissionContact(lead.data);
  const siteName = allowed.find((item) => item.id === lead.site_id)?.name
    || allowed.find((item) => item.id === lead.site_id)?.subdomain || "Website";
  const backHref = `/dashboard/leads?view=${encodeURIComponent(view)}${q ? `&q=${encodeURIComponent(q)}` : ""}${site ? `&site=${encodeURIComponent(site)}` : ""}`;
  const conversation = <div className="flex min-h-full flex-col">
    <header className="sticky top-0 z-20 border-b border-[var(--platform-line)] bg-[var(--platform-ground)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-semibold">{contact.name || "Form submission"}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--platform-muted)]">{contact.email || "No email"} · {siteName}</p></div>
        <LeadInboxHeaderActions lead={lead} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><LeadStatusForm lead={lead} /></div>
    </header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 border-r border-[var(--platform-line)] p-4 sm:p-6">
        <LeadReplyThread lead={lead} supabase={supabase} />
      </div>
      <LeadInboxTabs
        details={<div className="space-y-3 text-sm">
          {contact.email ? <div className="break-all"><p className="text-xs text-[var(--platform-muted)]">Email</p><p>{contact.email}</p>
            <div className="mt-2"><CopyLeadValue value={contact.email} label="Email" /></div></div> : null}
          {contact.phone ? <div><p className="text-xs text-[var(--platform-muted)]">Phone</p><p>{contact.phone}</p></div> : null}
          <div><p className="text-xs text-[var(--platform-muted)]">Website</p><p>{siteName}</p></div>
          <div><p className="text-xs text-[var(--platform-muted)]">Status</p><p className="capitalize">{leadStatusLabels[lead.status]}</p></div>
          {lead.snoozed_until ? <div><p className="text-xs text-[var(--platform-muted)]">Snoozed until</p><LocalTime value={lead.snoozed_until} /></div> : null}
          {lead.remind_at ? <div><p className="text-xs text-[var(--platform-muted)]">Reminder</p><LocalTime value={lead.remind_at} /></div> : null}
        </div>}
        notes={<div className="space-y-3"><LeadNoteForm leadId={lead.id} siteId={lead.site_id} />
          {notes.error ? <p role="alert" className="text-sm">Notes are unavailable.</p> : notes.data.map((note) => <article key={note.id} className="rounded-lg border border-[var(--platform-line)] p-3">
            <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
            <p className="mt-2 text-xs text-[var(--platform-muted)]"><LocalTime value={note.created_at} />{note.author_id === user.id ? " · Your note" : ""}</p>
          </article>)}
        </div>}
        timeline={<ol className="divide-y divide-[var(--platform-line)]">
          {events.error ? <li role="alert" className="py-2 text-sm">Timeline unavailable.</li> : events.data.map((event) => <li key={event.id} className="py-2 text-sm">
            {event.type.replaceAll("_", " ")}<div className="text-xs text-[var(--platform-muted)]"><LocalTime value={event.created_at} /></div>
          </li>)}
        </ol>}
      />
    </div>
  </div>;
  return <LeadsInboxLayout rows={rows} allowed={allowed} counts={counts.success ? counts.data as LeadInboxCounts : null}
    view={view} search={q} site={site} selectedLeadId={lead.id} conversation={conversation} detailBackHref={backHref} />;
}
