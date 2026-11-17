import { Suspense } from "react";
import { requireUser } from "@/lib/auth";

export default function FormsPage() {
  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Submissions from your website forms.
        </p>
      </header>
      <Suspense
        fallback={<div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />}
      >
        <FormsContent />
      </Suspense>
    </section>
  );
}

async function FormsContent() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("form_submissions")
    .select("id, form_name, data, created_at, is_read, site:sites(name, subdomain)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">Could not load form submissions. Please retry.</p>;
  if (data?.length) {
    const rows = data as unknown as { id: string; form_name: string | null; data: unknown; created_at: string; is_read: boolean; site: { name: string | null; subdomain: string } | null }[];
    return <div className="overflow-x-auto rounded-[14px] border border-[#E8E7E3] bg-white"><table className="w-full min-w-[560px] text-left text-sm">
      <thead className="text-xs text-[#6B6A66]"><tr>{["From", "Site", "Form", "Message", "Received"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const details = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
        return <tr key={row.id} className="border-t border-[#E8E7E3]"><td className="px-4 py-3">{typeof details.name === "string" ? details.name : "Enquiry"}</td>
          <td className="px-4 py-3">{row.site?.name || row.site?.subdomain || "Site"}</td><td className="px-4 py-3">{row.form_name || "Form"}</td>
          <td className="max-w-72 truncate px-4 py-3">{typeof details.message === "string" ? details.message : "Form submission"}</td>
          <td className="px-4 py-3">{new Date(row.created_at).toLocaleDateString("en", { timeZone: "UTC" })}</td></tr>;
      })}</tbody></table><p className="border-t border-[#E8E7E3] px-4 py-3 text-xs text-[#6B6A66]">Showing the latest 100 submissions.</p></div>;
  }

  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
      <p className="font-medium text-zinc-900">No submissions yet</p>
      <p className="mt-1 text-sm text-zinc-600">
        Form submissions from your sites will appear here.
      </p>
    </div>
  );
}
