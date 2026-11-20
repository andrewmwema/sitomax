import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { submissionSearchMatches, type Lead, type SubmissionFilters, type SubmissionSite } from "./submissions";

type Client = Awaited<ReturnType<typeof createClient>>;
export const LEAD_COLUMNS = "id, site_id, form_name, page_path, data, created_at, is_read, status, last_activity_at, has_unread_reply, archived";
export const SUBMISSION_PAGE_SIZE = 25;

export class SubmissionQueryError extends Error {
  constructor(cause: unknown) {
    super("Could not load form submissions.", { cause });
    this.name = "SubmissionQueryError";
  }
}

export async function allowedLeadSites(supabase: Client, userId: string): Promise<SubmissionSite[]> {
  const [sites, memberships, admin] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain"),
    supabase.from("account_members").select("account_id").eq("user_id", userId).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sites.error || memberships.error || admin.error) throw new SubmissionQueryError(sites.error ?? memberships.error ?? admin.error);
  const owned = new Set(memberships.data.map((member) => member.account_id));
  return sites.data.filter((site) => admin.data || owned.has(site.account_id));
}

function filteredQuery(supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date, count = false, ids?: string[]) {
  let query = supabase.from("form_submissions").select(LEAD_COLUMNS, count ? { count: "exact" } : {})
    .in("site_id", sites.map((site) => site.id));
  if (ids) query = query.in("id", ids);
  else query = query.eq("archived", filters.archived === "1");
  if (filters.site) query = query.eq("site_id", filters.site);
  if (filters.days !== "all") query = query.gte("created_at", new Date(now.getTime() - Number(filters.days) * 86400000).toISOString());
  if (filters.status === "read") query = query.eq("is_read", true);
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  return query;
}

export async function* submissionBatches(
  supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date, ascending = false, ids?: string[],
) {
  if (!sites.length) return;
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  for (let offset = 0; ; offset += 500) {
    const query = filteredQuery(supabase, sites, filters, now, false, ids);
    if (!ascending) query.order("has_unread_reply", { ascending: false }).order("is_read", { ascending: true });
    const { data, error } = await query.order("created_at", { ascending }).order("id", { ascending }).range(offset, offset + 499);
    if (error || !data) throw new SubmissionQueryError(error);
    const rows: Lead[] = data;
    yield filters.q ? rows.filter((row) => submissionSearchMatches(row, filters.q, siteMap.get(row.site_id))) : rows;
    if (rows.length < 500) return;
  }
}

export async function getSubmissionPage(supabase: Client, sites: SubmissionSite[], filters: SubmissionFilters, now: Date) {
  if (!sites.length) return { rows: [] as Lead[], count: 0 };
  const offset = (filters.page - 1) * SUBMISSION_PAGE_SIZE;
  if (!filters.q) {
    const { data, count, error } = await filteredQuery(supabase, sites, filters, now, true)
      .order("has_unread_reply", { ascending: false }).order("is_read", { ascending: true })
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + SUBMISSION_PAGE_SIZE - 1);
    if (error || !data) throw new SubmissionQueryError(error);
    const rows: Lead[] = data;
    return { rows, count: count ?? 0 };
  }
  // PostgREST cannot filter arbitrary JSON values as text. Scan only on search,
  // retaining one result page so custom form schemas remain searchable.
  let count = 0;
  const rows: Lead[] = [];
  for await (const batch of submissionBatches(supabase, sites, filters, now)) {
    for (const row of batch) {
      if (count >= offset && rows.length < SUBMISSION_PAGE_SIZE) rows.push(row);
      count += 1;
    }
  }
  return { rows, count };
}
