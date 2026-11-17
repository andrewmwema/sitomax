import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { pageSeoSchema, siteSeoSchema } from "@/lib/seo";
import { seoChecklist } from "@/lib/seo-checklist";
import { RedirectManager, SeoSettings } from "@/components/dashboard/seo-settings";
import { PageSeoManager, type PageSeoRow } from "@/components/dashboard/page-seo-manager";

export default function SeoPage({ params }: PageProps<"/dashboard/sites/[siteId]/seo">) {
  return <Suspense fallback={<p role="status">Loading SEO...</p>}><SeoContent params={params} /></Suspense>;
}

async function SeoContent({ params }: { params: PageProps<"/dashboard/sites/[siteId]/seo">["params"] }) {
  const { siteId } = await params;
  const { supabase } = await requireUser();
  const [{ data: site, error: siteError }, { data: redirects, error: redirectsError }, { data: pages, error: pagesError }] = await Promise.all([
    supabase.from("sites").select("id, name, subdomain, business, seo").eq("id", siteId).maybeSingle(),
    supabase.from("redirects").select("id, from_path, to_path").eq("site_id", siteId).order("from_path"),
    supabase.from("pages").select("id, title, slug, draft_data, seo, published_at").eq("site_id", siteId).order("sort_order"),
  ]);
  if (siteError || redirectsError || pagesError) throw new Error("Could not load SEO settings. Check the SEO migration.");
  if (!site) notFound();
  const business = businessSchema.parse({ ...emptyBusiness, ...site.business });
  const seo = siteSeoSchema.parse(site.seo);
  const seoPages: PageSeoRow[] = (pages ?? []).map((page) => {
    const data = page.draft_data && typeof page.draft_data === "object" ? page.draft_data as Record<string, unknown> : {};
    const root = data.root && typeof data.root === "object" ? data.root as Record<string, unknown> : {};
    const props = root.props && typeof root.props === "object" ? root.props as Record<string, unknown> : {};
    const parsedPageSeo = pageSeoSchema.safeParse(page.seo);
    const savedPageSeo = parsedPageSeo.success ? parsedPageSeo.data : undefined;
    const { score, checks } = seoChecklist(page.draft_data, page.title, seo, page.seo);
    const rawIndexing = props.indexing;
    const indexing: PageSeoRow["indexing"] = rawIndexing === "index" || rawIndexing === "noindex"
      ? rawIndexing
      : rawIndexing === "inherit" || savedPageSeo?.noindex === null || savedPageSeo?.noindex === undefined
        ? "inherit" : savedPageSeo.noindex ? "noindex" : "index";
    return {
      id: page.id,
      title: page.title || page.slug || "Home",
      slug: page.slug,
      seoTitle: (typeof props.seoTitle === "string" && props.seoTitle.trim()) ||
        (typeof props.title === "string" && props.title.trim()) || savedPageSeo?.title || page.title || "",
      description: typeof props.description === "string" ? props.description : savedPageSeo?.description || "",
      socialImage: typeof props.socialImage === "string"
        ? props.socialImage || seo.socialImage
        : savedPageSeo?.image || seo.socialImage,
      indexing,
      score,
      hidden: !checks.find((check) => check.key === "indexing")?.complete,
      lastPublished: page.published_at ? new Date(page.published_at).toLocaleDateString() : null,
    };
  }).sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
  const averageScore = seoPages.length
    ? Math.round(seoPages.reduce((total, page) => total + page.score, 0) / seoPages.length)
    : 0;
  return <section className="space-y-6">
    <header><p className="text-sm text-zinc-500"><Link href={`/dashboard/sites/${siteId}`} className="hover:underline">{site.name || site.subdomain}</Link> / SEO</p>
      <h1 className="mt-1 text-2xl font-semibold">SEO</h1></header>
    <nav aria-label="Site settings" className="flex gap-4 border-b border-[#E8E7E3] text-sm"><Link href={`/dashboard/sites/${siteId}`} className="pb-3">Pages</Link><span aria-current="page" className="border-b-2 border-[#4B3FE0] pb-3 font-semibold">SEO</span></nav>
    <PageSeoManager siteId={site.id} siteSeo={seo} pages={seoPages} averageScore={averageScore} />
    <section className="platform-panel p-6"><h2 className="font-semibold">Business information</h2>
      <p className="mt-2 text-sm text-zinc-600">Used for structured data and shared with your business profile.</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{([
        ["Name", business.businessName || site.name || site.subdomain], ["Type", business.businessType],
        ["Address", business.address], ["Phone", business.phone], ["Email", business.email],
        ["City / service area", business.city], ["Opening hours", business.openingHours],
      ] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="whitespace-pre-wrap">{value || "Not provided"}</dd></div>)}</dl>
      <Link href={`/dashboard/sites/${siteId}#business-info`} className="mt-3 inline-block text-sm text-[#4B3FE0] underline">Edit business info</Link></section>
    <SeoSettings siteId={site.id} seo={seo} />
    <RedirectManager siteId={site.id} redirects={redirects ?? []} />
    <section className="platform-panel p-6"><h2 className="font-semibold">Page checklist</h2>
      <p className="mt-1 text-xs text-zinc-500">Checks the current draft. Publish a page to apply its SEO changes.</p>
      <ul className="mt-3 divide-y divide-[#E8E7E3]">{(pages ?? []).map((page) => {
        const { score, issues } = seoChecklist(page.draft_data, page.title, seo, page.seo);
        const color = score === 100 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700";
        return <li key={page.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div><p className="font-medium">{page.title || page.slug || "Home"} <span className={`ml-2 text-sm ${color}`}>{score}%</span></p>
            <p className="mt-1 text-sm text-zinc-600">{issues.length ? issues.join(" · ") : "No issues found"}</p></div>
          <Link href={`/editor/${page.id}`} className="text-sm font-medium text-[#4B3FE0] underline">Fix</Link></li>;
      })}</ul>
    </section>
  </section>;
}
