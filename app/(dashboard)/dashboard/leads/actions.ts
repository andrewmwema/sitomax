"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { allowedLeadSites, getSubmissionPage } from "@/lib/forms/queries";
import { leadInboxViews, leadMatchesInboxView, type LeadInboxCounts, type LeadInboxViewRow } from "@/lib/forms/inbox";
import { submissionFiltersSchema, type Lead } from "@/lib/forms/submissions";

const pageSchema = z.object({
  view: z.enum(leadInboxViews),
  q: z.string().trim().max(200).default(""),
  site: z.union([z.literal(""), z.uuid()]).default(""),
  // Passed back exactly as the database returned it: the keyset comparison needs full precision.
  cursor: z.object({ at: z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)$/), id: z.uuid() }).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
  counts: z.boolean().default(false),
});
const countsSchema = z.object({
  needs_reply: z.number(), waiting: z.number(), all_open: z.number(), starred: z.number(),
  won: z.number(), lost: z.number(), archived: z.number(), trash: z.number(),
});

export type LeadInboxPage = { rows: Lead[]; hasMore: boolean; counts: LeadInboxCounts | null; error?: undefined };

export async function fetchLeadInbox(raw: unknown): Promise<LeadInboxPage | { error: string }> {
  const parsed = pageSchema.safeParse(raw);
  if (!parsed.success) return { error: "Choose a valid lead view or search." };
  const { view, q, site, cursor, limit, counts } = parsed.data;
  const { supabase, user } = await requireUser();
  const [page, countsResult] = await Promise.all([
    supabase.rpc("lead_inbox_view", {
      p_view: view, p_site_id: site || null, p_search: q || null,
      p_cursor_at: cursor?.at ?? null, p_cursor_id: cursor?.id ?? null, p_limit: limit,
    }),
    counts ? supabase.rpc("lead_inbox_counts", { p_site_id: site || null }) : null,
  ]);
  const parsedCounts = countsSchema.safeParse(countsResult?.data);
  const inboxCounts = parsedCounts.success ? parsedCounts.data : null;
  if (!page.error && Array.isArray(page.data)) {
    const rows = page.data as Lead[];
    return { rows, hasMore: rows.length === limit, counts: inboxCounts };
  }
  console.error("Could not load the lead inbox view", { code: page.error?.code });
  if (cursor) return { error: "Could not load more leads. Refresh the inbox and try again." };
  try {
    // Before the inbox functions are installed, fall back to the first page of the plain query.
    const allowed = await allowedLeadSites(supabase, user.id);
    if (site && !allowed.some((item) => item.id === site)) return { error: "This site is unavailable or you do not have permission to view its leads." };
    const filters = submissionFiltersSchema.parse({ site, q, page: 1, days: "all", status: "all", archived: view === "archived" ? "1" : "0" });
    const result = await getSubmissionPage(supabase, allowed, filters, new Date());
    const rows = result.rows.filter((row) => leadMatchesInboxView({
      status: row.status, starred: row.starred ?? false,
      archived_at: row.archived_at ?? (row.archived ? row.created_at : null),
      deleted_at: row.deleted_at ?? null, snoozed_until: row.snoozed_until ?? null,
      last_message_direction: row.last_message_direction ?? null,
    } satisfies LeadInboxViewRow, view));
    return { rows, hasMore: false, counts: inboxCounts };
  } catch (error) {
    console.error("Could not load leads", { type: error instanceof Error ? error.name : "Unknown" });
    return { error: "Could not load leads. Refresh the page and try again." };
  }
}
