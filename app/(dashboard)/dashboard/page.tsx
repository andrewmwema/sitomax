import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SiteCard, type SiteCardSite } from "@/components/dashboard/site-card";
import { AiUsageCards } from "@/components/dashboard/ai-usage-cards";

type SiteRow = SiteCardSite & {
  account: { id: string; name: string } | null;
};

/**
 * Sites page: super admins see every site grouped by client;
 * clients see only their own sites (enforced by RLS).
 */
export default function SitesPage() {
  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage and edit your websites.
        </p>
      </header>
      <Suspense fallback={<SitesSkeleton />}>
        <SitesList />
      </Suspense>
      <Suspense fallback={<p role="status" className="text-sm text-zinc-500">Loading AI usage...</p>}>
        <AiUsageCards />
      </Suspense>
    </section>
  );
}

function SitesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl bg-zinc-200"
        />
      ))}
    </div>
  );
}

async function SitesList() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select(
        "id, name, subdomain, custom_domain, domain_verified, pages(id, slug), account:accounts(id, name)",
      )
      .order("created_at", { ascending: true }),
  ]);

  // Without generated DB types, supabase-js infers to-one joins (account)
  // as arrays; at runtime they are single objects, so cast through unknown.
  const sites = (data ?? []) as unknown as SiteRow[];
  const createLink = profile?.is_super_admin ? <Link href="/dashboard/sites/new" className="inline-flex w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Create site</Link> : null;

  if (sites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
        <p className="font-medium text-zinc-900">No sites yet</p>
        <p className="mt-1 text-sm text-zinc-600">
          {profile?.is_super_admin
            ? "Create a client account, then add a site for them."
            : "Your websites will appear here once they are set up."}
        </p>
        {createLink}
      </div>
    );
  }

  if (!profile?.is_super_admin) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} />
        ))}
      </div>
    );
  }

  // Super admin: group sites by client account.
  const groups = new Map<string, { name: string; sites: SiteRow[] }>();
  for (const site of sites) {
    const key = site.account?.id ?? "unknown";
    const group = groups.get(key) ?? {
      name: site.account?.name ?? "Unknown client",
      sites: [],
    };
    group.sites.push(site);
    groups.set(key, group);
  }

  return (
    <div className="flex flex-col gap-10">
      {createLink}
      {[...groups.entries()].map(([accountId, group]) => (
        <div key={accountId}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            {group.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
