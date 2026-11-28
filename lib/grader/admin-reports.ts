import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { csvCell } from "@/lib/csv";
import { publicReportSchema, type PublicGraderReport } from "./public-report";
import { graderShareUrl } from "./presentation";
import { adminReportSchema } from "./report-schema";

export const GRADER_ADMIN_PAGE_SIZE = 25;
export const GRADER_ADMIN_EXPORT_LIMIT = 5000;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const graderAdminFiltersSchema = z.object({
  q: optional(z.string().trim().max(200)),
  unlocked: optional(z.enum(["unlocked", "locked"])),
  grade: optional(z.enum(["A", "B", "C", "D", "F", "none"])),
  source: optional(z.enum(["public", "admin"])),
  from: optional(date),
  to: optional(date),
  page: optional(z.coerce.number().int().min(1).max(10_000)),
});
export type GraderAdminFilters = z.infer<typeof graderAdminFiltersSchema>;

export function parseGraderAdminFilters(params: URLSearchParams) {
  return graderAdminFiltersSchema.safeParse(Object.fromEntries(
    ["q", "unlocked", "grade", "source", "from", "to", "page"].map((key) => [key, params.get(key)])));
}

export const graderAdminRowSchema = z.object({
  id: z.uuid(), slug: z.string(), created_at: z.string(), domain: z.string(), business_name: z.string().nullable(),
  url_input: z.string(), final_url: z.string().nullable(), city: z.string().nullable(),
  has_google_profile: z.enum(["yes", "no", "not_sure"]).nullable(), google_maps_url: z.string().nullable(),
  status: z.enum(["queued", "running", "complete", "failed"]), overall: z.number().nullable(), grade: z.string().nullable(),
  source: z.enum(["public", "admin"]), unlocked: z.boolean(), share_disabled: z.boolean(),
  unlock_name: z.string().nullable(), unlock_email: z.string().nullable(), lead_id: z.uuid().nullable(),
  compare_of_slug: z.string().nullable(), total_count: z.coerce.number(),
});
export type GraderAdminRow = Omit<z.infer<typeof graderAdminRowSchema>, "total_count">;

function nextDay(value: string) {
  const day = new Date(`${value}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
}

export async function listGraderReports(supabase: SupabaseClient, filters: GraderAdminFilters,
  options: { limit?: number; offset?: number } = {}) {
  const limit = options.limit ?? GRADER_ADMIN_PAGE_SIZE;
  const offset = options.offset ?? ((filters.page ?? 1) - 1) * limit;
  const { data, error } = await supabase.rpc("grader_admin_list_reports", {
    p_search: filters.q ?? null,
    p_unlocked: filters.unlocked ? filters.unlocked === "unlocked" : null,
    p_grade: filters.grade ?? null,
    p_source: filters.source ?? null,
    p_from: filters.from ? `${filters.from}T00:00:00Z` : null,
    p_to: filters.to ? nextDay(filters.to) : null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error("Could not list grader reports", { code: error.code });
    throw new Error("Could not list grader reports.");
  }
  const rows = z.array(graderAdminRowSchema).parse(data ?? []);
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row): GraderAdminRow => {
      const copy: Partial<typeof row> = { ...row };
      delete copy.total_count;
      return copy as GraderAdminRow;
    }),
  };
}

export function graderReportsCsv(rows: GraderAdminRow[], appUrl: string) {
  const header = ["Date", "Domain", "Business", "URL", "Score", "Grade", "Status", "Source", "Unlocked",
    "Name", "Email", "Lead", "Share link", "Share disabled", "Compared with"];
  const lines = rows.map((row) => [
    row.created_at, row.domain, row.business_name ?? "", row.final_url ?? row.url_input,
    row.overall === null ? "" : String(row.overall), row.grade ?? "", row.status, row.source,
    row.unlocked ? "yes" : "no", row.unlock_name ?? "", row.unlock_email ?? "",
    row.lead_id ? new URL(`/dashboard/leads/${row.lead_id}`, appUrl).href : "",
    graderShareUrl(row.slug), row.share_disabled ? "yes" : "no", row.compare_of_slug ?? "",
  ].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

/** Loads any report as a fully visible report, for super-admin PDFs. RLS limits the read to super admins. */
export async function adminFullReport(supabase: SupabaseClient, slug: string): Promise<PublicGraderReport | null> {
  const { data, error } = await supabase.from("grader_reports")
    .select("slug, url_input, final_url, domain, business_name, city, status, progress, results, scores, ai_summary, screenshot_url, created_at, completed_at")
    .eq("slug", slug).maybeSingle();
  if (error) {
    console.error("Could not load grader report for administrator", { code: error.code });
    throw new Error("Could not load grader report.");
  }
  if (!data) return null;
  const row = adminReportSchema.extend({ created_at: z.string(), completed_at: z.string().nullable() }).parse(data);
  if (row.status !== "complete") return null;
  return publicReportSchema.parse({
    slug: row.slug, url: row.final_url, domain: row.domain, status: row.status, progress: row.progress,
    scores: row.scores, screenshot_url: row.screenshot_url, unlocked: true,
    scanned_at: row.completed_at ?? row.created_at, business_name: row.business_name,
    headline: row.ai_summary?.headline ?? null,
    top_issues: row.ai_summary?.top_issues.map(({ title, why_it_matters }) => ({ title, why_it_matters })) ?? null,
    results: row.results, ai_summary: row.ai_summary,
  });
}
