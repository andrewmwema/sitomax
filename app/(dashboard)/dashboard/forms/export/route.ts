import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { leadStatusLabels, selectedLeadIdsSchema, submissionFiltersSchema } from "@/lib/forms/submissions";
import { allowedLeadSites, submissionBatches, SubmissionQueryError } from "@/lib/forms/queries";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Authentication required.", { status: 401 });
  const params = new URL(request.url).searchParams;
  const parsed = submissionFiltersSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return new Response("Invalid submission filters.", { status: 400 });
  const selected = params.has("id") ? selectedLeadIdsSchema.safeParse(params.getAll("id")) : null;
  if (selected && !selected.success) return new Response("Invalid lead selection.", { status: 400 });
  const filters = parsed.data;

  const lines = [["Received (UTC)", "Site", "Form", "Page", "Read", "Details", "Status", "Last activity (UTC)"].map(csvCell).join(",")];
  try {
    const allowed = await allowedLeadSites(supabase, user.id);
    if (!allowed.length || (filters.site && !allowed.some((site) => site.id === filters.site))) return new Response("Access denied.", { status: 403 });
    for await (const rows of submissionBatches(supabase, allowed, filters, new Date(), true, selected?.data)) {
      for (const row of rows) {
        const site = allowed.find((item) => item.id === row.site_id);
        lines.push([row.created_at, site?.name || site?.subdomain || "Site", row.form_name || "Form", row.page_path || "/", row.is_read ? "Yes" : "No", JSON.stringify(row.data ?? {}), leadStatusLabels[row.status], row.last_activity_at].map(csvCell).join(","));
      }
    }
  } catch (error) {
    if (!(error instanceof SubmissionQueryError)) throw error;
    console.error("Could not export form submissions.");
    return new Response("Could not export submissions.", { status: 500 });
  }
  return new Response(`${lines.join("\r\n")}\r\n`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="form-submissions.csv"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
