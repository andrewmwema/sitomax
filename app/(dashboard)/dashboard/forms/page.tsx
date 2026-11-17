import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { MarkSubmissionRead } from "@/components/dashboard/mark-submission-read";

type Submission = {
  id: string; site_id: string; form_name: string | null; page_path: string | null;
  data: unknown; created_at: string; is_read: boolean;
};

export default function FormsPage({ searchParams }: PageProps<"/dashboard/forms">) {
  return <Suspense fallback={<p role="status">Loading submissions...</p>}><FormsContent searchParams={searchParams} /></Suspense>;
}

async function FormsContent({ searchParams }: { searchParams: PageProps<"/dashboard/forms">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const [{ data: sites, error: sitesError }, { data: memberships, error: memberError }, { data: admin, error: adminError }] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain").order("name"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesError || memberError || adminError) throw new Error("Could not load form permissions.");
  const allowed = (sites ?? []).filter((site) => admin || memberships?.some((member) => member.account_id === site.account_id));
  const siteId = typeof params.site === "string" ? params.site : "";
  if (siteId && !allowed.some((site) => site.id === siteId)) return <p role="alert">This site is unavailable or you do not have permission to view its submissions.</p>;
  if (!allowed.length) return <section><h1 className="text-2xl font-semibold">Forms</h1><p className="mt-4 text-sm text-zinc-600">Submissions are available to account owners.</p></section>;
  let query = supabase.from("form_submissions").select("id, site_id, form_name, page_path, data, created_at, is_read")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) return <p role="alert">Could not load form submissions. Please retry.</p>;
  const rows: Submission[] = data ?? [];
  return <section className="flex flex-col gap-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">Forms</h1><p className="mt-1 text-sm text-[#6B6A66]">Submissions from your websites.</p></header>
    <div className="platform-panel flex flex-wrap items-end gap-3 p-5">
      <form className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">Site<select name="site" defaultValue={siteId} className="rounded-lg border border-[#E8E7E3] bg-white p-2.5">
          <option value="">All sites</option>{allowed.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}</select></label>
        <button className="platform-button platform-button-primary">View</button>
      </form>
      <a href={`/dashboard/forms/export${siteId ? `?site=${encodeURIComponent(siteId)}` : ""}`} className="platform-button">Export CSV</a>
    </div>
    {rows.length ? <div className="platform-panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-[#6B6A66]"><tr>
        {["Site", "Form", "Received", "Status", "Details"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const site = allowed.find((item) => item.id === row.site_id);
          const values = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? Object.entries(row.data) : [];
          return <tr key={row.id} className="border-t border-[#E8E7E3] align-top"><td className="px-4 py-3">{site?.name || site?.subdomain || "Site"}</td>
            <td className="px-4 py-3">{row.form_name || "Form"}</td><td className="px-4 py-3">{new Date(row.created_at).toLocaleString("en", { timeZone: "UTC" })} UTC</td>
            <td className="px-4 py-3">{row.is_read ? "Read" : <MarkSubmissionRead id={row.id} />}</td>
            <td className="px-4 py-3"><details><summary className="cursor-pointer font-medium">View details{!row.is_read ? " · New" : ""}</summary>
              <p className="mt-2 text-xs text-[#6B6A66]">Page: {row.page_path || "/"}</p>
              <dl className="mt-2 space-y-2">{values.map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt>
                <dd className="max-w-96 whitespace-pre-wrap break-words">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl></details></td></tr>;
        })}</tbody></table>
      <p className="border-t border-[#E8E7E3] px-4 py-3 text-xs text-[#6B6A66]">Showing the latest 100 submissions. CSV includes all submissions for the selected site.</p>
    </div> : <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center"><p className="font-medium">No submissions yet</p></div>}
  </section>;
}
