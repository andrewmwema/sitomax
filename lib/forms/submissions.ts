import { z } from "zod";

export const submissionFiltersSchema = z.object({
  site: z.union([z.literal(""), z.uuid()]).default(""),
  days: z.enum(["all", "7", "30", "90"]).default("all"),
  status: z.enum(["all", "new", "read"]).default("all"),
  q: z.string().trim().max(200, "Keep searches under 200 characters.").default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type SubmissionFilters = z.infer<typeof submissionFiltersSchema>;
export type Submission = {
  id: string; site_id: string; form_name: string | null; page_path: string | null;
  data: unknown; created_at: string; is_read: boolean;
};
export type SubmissionSite = { id: string; name: string | null; subdomain: string };

export function submissionSearchMatches(row: Submission, search: string, site?: SubmissionSite) {
  const text = [row.form_name, row.page_path, site?.name, site?.subdomain, JSON.stringify(row.data)].join(" ");
  return text.toLowerCase().includes(search.trim().toLowerCase());
}

export function submissionQueryString(filters: SubmissionFilters, page = 1) {
  const params = new URLSearchParams();
  if (filters.site) params.set("site", filters.site);
  if (filters.days !== "all") params.set("days", filters.days);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function submissionFields(data: unknown): [string, unknown][] {
  if (data && typeof data === "object" && !Array.isArray(data)) return Object.entries(data);
  return data === null || data === undefined ? [] : [["Response", data]];
}

export function submissionContact(data: unknown) {
  const fields = submissionFields(data);
  const normalized = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "");
  const textField = (names: string[]) => {
    const value = fields.find(([key, value]) => names.includes(normalized(key)) && typeof value === "string")?.[1];
    return typeof value === "string" ? value : undefined;
  };
  return {
    name: textField(["name", "fullname", "contactname"]),
    email: textField(["email", "emailaddress"]),
  };
}
