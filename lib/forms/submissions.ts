import { z } from "zod";

export const leadStatuses = ["new", "contacted", "won", "lost"] as const;
export const leadStatusLabels = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost" } as const;
export const leadStatusSchema = z.enum(leadStatuses);
export const selectedLeadIdsSchema = z.array(z.uuid()).min(1).max(25);

export const submissionFiltersSchema = z.object({
  site: z.union([z.literal(""), z.uuid()]).default(""),
  days: z.enum(["all", "7", "30", "90"]).default("all"),
  status: z.enum(["all", "read", ...leadStatuses]).default("all"),
  archived: z.enum(["0", "1"]).default("0"),
  q: z.string().trim().max(200, "Keep searches under 200 characters.").default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type SubmissionFilters = z.infer<typeof submissionFiltersSchema>;
export type Submission = {
  id: string; site_id: string; form_name: string | null; page_path: string | null;
  data: unknown; created_at: string; is_read: boolean;
};
export type Lead = Submission & {
  status: z.infer<typeof leadStatusSchema>; last_activity_at: string; has_unread_reply: boolean; archived: boolean;
  starred?: boolean; archived_at?: string | null; deleted_at?: string | null;
  snoozed_until?: string | null; remind_at?: string | null;
  last_message_direction?: "in" | "out" | null; last_message_at?: string | null;
  last_message_preview?: string | null; unread?: boolean;
};
export type LeadNote = { id: string; author_id: string | null; body: string; created_at: string };
export type LeadEvent = {
  id: string; type: "created" | "status_changed" | "note_added" | "email_sent" | "reply_received";
  data: Record<string, unknown>; created_at: string;
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
  if (filters.archived === "1") params.set("archived", "1");
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
    phone: textField(["phone", "phonenumber", "telephone", "mobile", "mobilephone"]),
  };
}
