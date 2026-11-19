import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { submissionSearchMatches, type Submission, type SubmissionFilters, type SubmissionSite } from "./submissions";

type Client = Awaited<ReturnType<typeof createClient>>;
const COLUMNS = "id, site_id, form_name, page_path, data, created_at, is_read";
export const SUBMISSION_PAGE_SIZE = 25;

export class SubmissionQueryError extends Error {
  constructor(cause: unknown) {
    super("Could not load form submissions.", { cause });
    this.name = "SubmissionQueryError";
  }
}

function filteredQuery(supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date, count = false) {
  let query = supabase.from("form_submissions").select(COLUMNS, count ? { count: "exact" } : {})
    .in("site_id", sites.map((site) => site.id));
  if (filters.site) query = query.eq("site_id", filters.site);
  if (filters.days !== "all") query = query.gte("created_at", new Date(now.getTime() - Number(filters.days) * 86400000).toISOString());
  if (filters.status !== "all") query = query.eq("is_read", filters.status === "read");
  return query;
}

export async function* submissionBatches(
  supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date, ascending = false,
) {
  if (!sites.length) return;
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await filteredQuery(supabase, sites, filters, now)
      .order("created_at", { ascending }).order("id", { ascending }).range(offset, offset + 499);
    if (error || !data) throw new SubmissionQueryError(error);
    const rows: Submission[] = data;
    yield filters.q ? rows.filter((row) => submissionSearchMatches(row, filters.q, siteMap.get(row.site_id))) : rows;
    if (rows.length < 500) return;
  }
}

export async function getSubmissionPage(supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date) {
  if (!sites.length) return { rows: [] as Submission[], count: 0 };
  const offset = (filters.page - 1) * SUBMISSION_PAGE_SIZE;
  if (!filters.q) {
    const { data, count, error } = await filteredQuery(supabase, sites, filters, now, true)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + SUBMISSION_PAGE_SIZE - 1);
    if (error || !data) throw new SubmissionQueryError(error);
    const rows: Submission[] = data;
    return { rows, count: count ?? 0 };
  }
  // PostgREST cannot filter arbitrary JSON values as text. Scan only on search,
  // retaining one result page so custom form schemas remain searchable.
  let count = 0;
  const rows: Submission[] = [];
  for await (const batch of submissionBatches(supabase, sites, filters, now)) {
    for (const row of batch) {
      if (count >= offset && rows.length < SUBMISSION_PAGE_SIZE) rows.push(row);
      count += 1;
    }
  }
  return { rows, count };
}
