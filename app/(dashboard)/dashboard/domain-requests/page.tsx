import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { domainRequestSchema } from "@/lib/domains/requests";
import { getProvider } from "@/lib/domains/providers";
import { DomainRequestUpdate } from "@/components/dashboard/domain-request-update";

export default function DomainRequestsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Domain requests</h1>
      <p className="mt-2 text-sm text-zinc-600">Manage delegated domain setup. Use limited DNS access only; never collect registrar credentials.</p></header>
    <Suspense fallback={<p role="status">Loading domain requests...</p>}><Requests searchParams={searchParams} /></Suspense>
  </section>;
}

async function Requests({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase } = await requireSuperAdmin();
  const page = z.coerce.number().int().min(1).max(10_000).safeParse((await searchParams).page ?? 1);
  if (!page.success) notFound();
  const offset = (page.data - 1) * 25;
  const result = await supabase.from("domain_requests").select(
    "id, site_id, domain, provider, status, notes, created_at, site:sites(name, subdomain, account:accounts(name))",
    { count: "exact" },
  ).order("created_at", { ascending: false }).order("id").range(offset, offset + 24);
  if (result.error) throw new Error("Could not load domain requests. Apply the domain requests migration.");
  const requests = z.array(domainRequestSchema.extend({
    site: z.object({ name: z.string().nullable(), subdomain: z.string(), account: z.object({ name: z.string() }) }),
  })).parse(result.data ?? []);
  return <>
    <p className="text-sm text-zinc-500">Marking a request Done emails its account owners. Failed emails are retried by the scheduled domain job; actual domain verification remains separate.</p>
    <div className="platform-panel overflow-x-auto">
      {requests.length ? <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-[#E8E7E3] bg-[#F7F7F5] text-xs text-zinc-500"><tr>
          <th className="p-5 font-medium">Client / site</th><th className="p-5 font-medium">Domain / provider</th>
          <th className="p-5 font-medium">Requested</th><th className="w-80 p-5 font-medium">Status and update</th>
        </tr></thead>
        <tbody className="divide-y divide-[#E8E7E3]">{requests.map((request) => <tr key={request.id} className="align-top">
          <td className="p-5"><p className="font-medium">{request.site.account.name}</p>
            <Link href={`/dashboard/sites/${request.site_id}/domains`} className="mt-1 inline-block text-xs text-[#4B3FE0] underline">{request.site.name || request.site.subdomain}</Link></td>
          <td className="p-5"><p className="break-all font-medium">{request.domain}</p><p className="mt-1 text-xs text-zinc-500">{getProvider(request.provider).name}</p></td>
          <td className="p-5 text-xs text-zinc-500">{new Date(request.created_at).toLocaleDateString()}</td>
          <td className="p-5"><DomainRequestUpdate request={request} /></td>
        </tr>)}</tbody>
      </table> : <p className="p-8 text-sm text-zinc-500">No domain requests on this page.</p>}
    </div>
    <nav aria-label="Domain request pagination" className="flex justify-between text-sm">
      {page.data > 1 ? <Link href={`/dashboard/domain-requests?page=${page.data - 1}`} className="underline">Previous</Link> : <span />}
      {offset + 25 < (result.count ?? 0) ? <Link href={`/dashboard/domain-requests?page=${page.data + 1}`} className="underline">Next</Link> : null}
    </nav>
  </>;
}
