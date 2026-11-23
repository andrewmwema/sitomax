import { Suspense } from "react";
import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { DomainSettings } from "@/components/dashboard/domain-settings";
import { loadDomainSettings } from "./actions";
import { loadDomainAssistance } from "@/lib/domains/request-data";
import { SiteSettingsNav } from "@/components/dashboard/site-settings-nav";

export default function DomainsPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ editorPage?: string | string[] }>;
}) {
  return <Suspense fallback={<p role="status">Loading domain settings...</p>}>
    <DomainContent params={params} searchParams={searchParams} />
  </Suspense>;
}

async function DomainContent({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ editorPage?: string | string[] }>;
}) {
  const { siteId } = await params;
  const initial = await loadDomainSettings(siteId);
  if (!initial.site) return <p role="alert" className="text-sm text-red-700">{initial.error}</p>;
  const requestedPage = z.uuid().safeParse((await searchParams).editorPage);
  const [assistance, editorPage] = await Promise.all([
    loadDomainAssistance(siteId),
    requestedPage.success ? (async () => {
      const { supabase } = await requireUser();
      const { data, error } = await supabase.from("pages").select("id")
        .eq("site_id", siteId).eq("id", requestedPage.data).maybeSingle();
      if (error) throw new Error("Could not check the originating editor page.", { cause: error });
      return data?.id ?? null;
    })() : Promise.resolve(null),
  ]);
  return <section className="space-y-6">
    <header>
      <p className="text-sm text-zinc-500"><Link href={`/dashboard/sites/${siteId}`} className="hover:underline">
        {initial.site.name || initial.site.subdomain}
      </Link> / Domains</p>
      <h1 className="mt-1 text-2xl font-semibold">Domains</h1>
      <p className="mt-2 text-sm text-zinc-600">Give your website a home on your own domain.</p>
      {editorPage ? <a href={`/editor/${editorPage}`} target="_blank" rel="noopener noreferrer" className="platform-button mt-4">Back to editor</a> : null}
    </header>
    <SiteSettingsNav siteId={siteId} current="domains" canManageDomains />
    <DomainSettings siteId={siteId} initial={initial} assistance={assistance} />
  </section>;
}
