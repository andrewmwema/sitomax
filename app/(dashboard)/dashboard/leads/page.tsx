import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { allowedLeadSites, getSubmissionPage } from "@/lib/forms/queries";
import { leadMatchesInboxView, leadInboxViews, type LeadInboxCounts, type LeadInboxViewRow } from "@/lib/forms/inbox";
import { submissionFiltersSchema, type Lead } from "@/lib/forms/submissions";
import { LeadsInboxLayout } from "@/components/dashboard/leads-inbox-layout";
import { z } from "zod";

export default function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<div role="status" aria-label="Loading leads" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}>
    <LeadsContent searchParams={searchParams} />
  </Suspense>;
}

async function LeadsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const parsed = z.object({
    view: z.enum(leadInboxViews).default("needs_reply"),
    q: z.string().trim().max(200).default(""),
    site: z.union([z.literal(""), z.uuid()]).default(""),
  }).safeParse(params);
  if (!parsed.success) return <p role="alert" className="text-sm text-[var(--platform-error)]">Choose a valid lead view or search.</p>;
  const { view, q, site } = parsed.data;
  const allowed = await allowedLeadSites(supabase, user.id);
  if (site && !allowed.some((item) => item.id === site)) return <p role="alert">This site is unavailable or you do not have permission to view its leads.</p>;

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
  if (!rpc.error && Array.isArray(rpc.data)) {
    rows = rpc.data as Lead[];
  } else {
    const fallbackFilters = submissionFiltersSchema.parse({
      site, q, page: 1, days: "all",
      status: "all",
      archived: view === "archived" ? "1" : "0",
    });
    const result = await getSubmissionPage(supabase, allowed, fallbackFilters, new Date());
    rows = result.rows.filter((row) => leadMatchesInboxView({
      status: row.status,
      starred: row.starred ?? false,
      archived_at: row.archived_at ?? (row.archived ? row.created_at : null),
      deleted_at: row.deleted_at ?? null,
      snoozed_until: row.snoozed_until ?? null,
      last_message_direction: row.last_message_direction ?? null,
    } satisfies LeadInboxViewRow, view));
  }
  return <>
    <header className="mb-5"><p className="platform-eyebrow mb-1">Operations · Leads</p>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
    </header>
    <LeadsInboxLayout rows={rows} allowed={allowed} counts={counts.success ? counts.data as LeadInboxCounts : null}
      view={view} search={q} site={site} detailBackHref={`/dashboard/leads?view=${encodeURIComponent(view)}${q ? `&q=${encodeURIComponent(q)}` : ""}${site ? `&site=${encodeURIComponent(site)}` : ""}`} />
  </>;
}
