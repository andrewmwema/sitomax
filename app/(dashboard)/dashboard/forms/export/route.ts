import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Authentication required.", { status: 401 });
  const siteId = new URL(request.url).searchParams.get("site");
  if (siteId && !z.uuid().safeParse(siteId).success) return new Response("Invalid site.", { status: 400 });
  const [{ data: sites, error: sitesError }, { data: memberships, error: memberError }, { data: admin, error: adminError }] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesError || memberError || adminError) return new Response("Could not check permissions.", { status: 500 });
  const allowed = (sites ?? []).filter((site) => admin || memberships?.some((member) => member.account_id === site.account_id));
  if (!allowed.length || (siteId && !allowed.some((site) => site.id === siteId))) return new Response("Access denied.", { status: 403 });

  const lines = [["Received (UTC)", "Site", "Form", "Page", "Read", "Details"].map(csvCell).join(",")];
  let offset = 0;
  while (true) {
    let query = supabase.from("form_submissions").select("site_id, form_name, page_path, data, created_at, is_read")
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
    if (siteId) query = query.eq("site_id", siteId);
    const { data, error } = await query;
    if (error || !data) {
      console.error("Could not export form submissions:", error?.message ?? "Missing result.");
      return new Response("Could not export submissions.", { status: 500 });
    }
    if (!data.length) break;
    for (const row of data) {
      const site = allowed.find((item) => item.id === row.site_id);
      lines.push([row.created_at, site?.name || site?.subdomain || "Site", row.form_name || "Form", row.page_path || "/", row.is_read ? "Yes" : "No", JSON.stringify(row.data ?? {})].map(csvCell).join(","));
    }
    offset += data.length;
  }
  return new Response(`${lines.join("\r\n")}\r\n`, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="form-submissions.csv"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
