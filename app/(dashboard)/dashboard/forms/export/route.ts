import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { submissionFiltersSchema } from "@/lib/forms/submissions";
import { submissionBatches, SubmissionQueryError } from "@/lib/forms/queries";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Authentication required.", { status: 401 });
  const parsed = submissionFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return new Response("Invalid submission filters.", { status: 400 });
  const filters = parsed.data;
  const siteId = filters.site;
  const [{ data: sites, error: sitesError }, { data: memberships, error: memberError }, { data: admin, error: adminError }] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesError || memberError || adminError) return new Response("Could not check permissions.", { status: 500 });
  const allowed = (sites ?? []).filter((site) => admin || memberships?.some((member) => member.account_id === site.account_id));
  if (!allowed.length || (siteId && !allowed.some((site) => site.id === siteId))) return new Response("Access denied.", { status: 403 });

  const lines = [["Received (UTC)", "Site", "Form", "Page", "Read", "Details"].map(csvCell).join(",")];
  try {
    for await (const rows of submissionBatches(supabase, allowed, filters, new Date(), true)) {
      for (const row of rows) {
        const site = allowed.find((item) => item.id === row.site_id);
        lines.push([row.created_at, site?.name || site?.subdomain || "Site", row.form_name || "Form", row.page_path || "/", row.is_read ? "Yes" : "No", JSON.stringify(row.data ?? {})].map(csvCell).join(","));
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
