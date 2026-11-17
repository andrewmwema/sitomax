import { Suspense } from "react";
import Link from "next/link";
import { DomainSettings } from "@/components/dashboard/domain-settings";
import { loadDomainSettings } from "./actions";
import { loadDomainAssistance } from "@/lib/domains/request-data";

export default function DomainsPage({ params }: { params: Promise<{ siteId: string }> }) {
  return <Suspense fallback={<p role="status">Loading domain settings...</p>}>
    <DomainContent params={params} />
  </Suspense>;
}

async function DomainContent({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const initial = await loadDomainSettings(siteId);
  if (!initial.site) return <p role="alert" className="text-sm text-red-700">{initial.error}</p>;
  const assistance = await loadDomainAssistance(siteId);
  return <section className="space-y-6">
    <header>
      <p className="text-sm text-zinc-500"><Link href={`/dashboard/sites/${siteId}`} className="hover:underline">
        {initial.site.name || initial.site.subdomain}
      </Link> / Domains</p>
      <h1 className="mt-1 text-2xl font-semibold">Domains</h1>
      <p className="mt-2 text-sm text-zinc-600">Give your website a home on your own domain.</p>
    </header>
    <nav aria-label="Site settings" className="flex gap-4 border-b border-[#E8E7E3] text-sm">
      <Link href={`/dashboard/sites/${siteId}`} className="pb-3 hover:underline">Pages</Link>
      <Link href={`/dashboard/sites/${siteId}/seo`} className="pb-3 hover:underline">SEO</Link>
      <span aria-current="page" className="border-b-2 border-[#4B3FE0] pb-3 font-semibold">Domains</span>
    </nav>
    <DomainSettings siteId={siteId} initial={initial} assistance={assistance} />
  </section>;
}
