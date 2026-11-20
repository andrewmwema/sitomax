import { Suspense } from "react";
import Link from "next/link";
import { Globe2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import SiteDomainsPage from "../sites/[siteId]/domains/page";

export default function DomainsPage() {
  return <Suspense fallback={<p role="status">Loading domains...</p>}>
    <DomainsContent />
  </Suspense>;
}

async function DomainsContent() {
  const { supabase, user } = await requireUser();
  const [sitesResult, membershipsResult, adminResult] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain, custom_domain, domain_verified").order("name"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesResult.error || membershipsResult.error || adminResult.error) {
    throw new Error("Could not load domain permissions.");
  }
  const ownerAccounts = new Set((membershipsResult.data ?? []).map(({ account_id }) => account_id));
  const sites = (sitesResult.data ?? []).filter((site) => adminResult.data || ownerAccounts.has(site.account_id));

  if (sites.length === 1) return <SiteDomainsPage params={Promise.resolve({ siteId: sites[0].id })} searchParams={Promise.resolve({})} />;

  return <section className="flex flex-col gap-6">
    <header>
      <p className="platform-eyebrow">Workspace</p>
      <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Domains</h1>
      <p className="mt-1 text-sm text-[var(--platform-muted)]">Connect and manage domains for your websites.</p>
    </header>
    {sites.length ? <div className="platform-panel overflow-hidden">
      {sites.map((site) => <div key={site.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--platform-line)] p-5 last:border-0">
        <div className="min-w-0">
          <h2 className="font-semibold">{site.name || site.subdomain}</h2>
          <p className="mt-1 break-all text-sm text-[var(--platform-muted)]">
            {site.custom_domain || "No custom domain connected"}
          </p>
          {site.custom_domain ? <p className="mt-1 text-xs text-[var(--platform-muted)]">
            {site.domain_verified ? "Connected" : "Pending verification"}
          </p> : null}
        </div>
        <Link href={`/dashboard/sites/${site.id}/domains`} className="platform-button">
          {site.custom_domain ? "Manage domain" : "Connect domain"}
          <span className="sr-only"> for {site.name || site.subdomain}</span>
        </Link>
      </div>)}
    </div> : <div className="platform-panel p-8 text-center">
      <Globe2 size={24} className="mx-auto text-[var(--platform-muted)]" />
      <h2 className="mt-3 text-sm font-semibold">No domains to manage yet</h2>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Domain management is available to account owners for their websites.</p>
      <Link href="/dashboard/sites" className="platform-button mt-4">View websites</Link>
    </div>}
  </section>;
}
