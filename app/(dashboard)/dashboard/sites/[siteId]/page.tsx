import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/tenant";
import { PagesManager, type ManagedPage } from "@/components/dashboard/pages-manager";
import { AiDraftHistory } from "@/components/dashboard/ai-draft-history";
import { BusinessInfo } from "@/components/dashboard/business-info";
import { businessSchema, emptyBusiness } from "@/lib/business";

/**
 * Site detail page: live URL and the pages manager (add, rename, reorder,
 * delete pages, set the home page). RLS restricts it to members of the
 * site's account and the super admin.
 */
export default function SitePage({
  params,
}: PageProps<"/dashboard/sites/[siteId]">) {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <SiteDetail params={params} />
    </Suspense>
  );
}

function SiteSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-2xl bg-zinc-200" />
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-200" />
    </div>
  );
}

async function SiteDetail({
  params,
}: {
  params: PageProps<"/dashboard/sites/[siteId]">["params"];
}) {
  const { siteId } = await params;
  const { supabase } = await requireUser();

  const { data: site } = await supabase
    .from("sites")
    .select(
      "id, account_id, name, subdomain, custom_domain, domain_verified, business, pages(id, slug, title, sort_order, published_at)",
    )
    .eq("id", siteId)
    .maybeSingle();

  if (!site) {
    notFound();
  }
  const [{ data: admin, error: adminError }, { data: owner, error: ownerError }] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: site.account_id }),
  ]);
  if (adminError || ownerError) throw new Error("Could not check site permissions.");
  const canGenerate = Boolean(admin || owner);
  const backups = canGenerate ? await supabase.from("site_draft_versions").select("id, created_at")
    .eq("site_id", siteId).order("created_at", { ascending: false }).limit(20) : null;

  const url = getSiteUrl(site);
  const pages = ([...(site.pages ?? [])] as ManagedPage[]).sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id),
  );

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {canGenerate ? <Link href={`/dashboard/sites/${siteId}/generate`} className="mb-5 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Build with AI</Link> : null}
          {canGenerate ? <Link href={`/dashboard/analytics?site=${encodeURIComponent(siteId)}`} className="mb-5 ml-2 inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium">View analytics</Link> : null}
          <p className="text-sm text-zinc-500">
            <Link href="/dashboard" className="hover:underline">
              Sites
            </Link>{" "}
            /
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {site.name ?? site.subdomain}
          </h1>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {url.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <div id="business-info"><BusinessInfo siteId={site.id} initialBusiness={businessSchema.parse({ ...emptyBusiness, ...site.business })} /></div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          View live
        </a>
      </header>

      <nav aria-label="Site settings" className="flex gap-4 border-b border-[#E8E7E3] text-sm">
        <span aria-current="page" className="border-b-2 border-[#4B3FE0] pb-3 font-semibold">Pages</span>
        <Link href={`/dashboard/sites/${siteId}/seo`} className="pb-3 hover:underline">SEO</Link>
      </nav>
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          Pages
        </h2>
        <PagesManager siteId={site.id} pages={pages} />
      </div>
      {canGenerate ? backups?.error ? <p role="alert" className="text-sm text-red-700">Draft history is unavailable. Ask your agency to apply the AI site-generator migration.</p>
        : <AiDraftHistory siteId={site.id} versions={backups?.data ?? []} /> : null}
    </section>
  );
}
