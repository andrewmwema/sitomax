import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AiSiteWizard } from "@/components/dashboard/ai-site-wizard";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { brand } from "@/lib/brand";
import { isEmptyPage } from "@/lib/editor/empty-page";
import { defaultMenuLabel } from "@/lib/page-navigation";
import { selectedSlugSchema } from "@/lib/ai/site-input";

export const maxDuration = 300;

export default async function RegenerateSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { supabase } = await requireUser();
  const { data: site, error } = await supabase.from("sites").select("id, account_id, name, business").eq("id", siteId).maybeSingle();
  if (error) throw new Error("Could not load the site.", { cause: error });
  if (!site) notFound();
  const [{ data: admin, error: adminError }, { data: owner, error: ownerError }] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: site.account_id }),
  ]);
  if (adminError || ownerError) throw new Error("Could not verify generation access.");
  if (!admin && !owner) notFound();
  const [{ data: pages, error: pageError }, { data: retries, error: retryError }] = await Promise.all([
    supabase.from("pages").select("slug, nav_label, draft_data, published_data").eq("site_id", siteId).order("sort_order").order("slug"),
    supabase.rpc("list_ai_page_retries", { p_site_id: siteId }),
  ]);
  if (pageError) throw new Error("Could not load the site pages.", { cause: pageError });
  if (retryError) throw new Error("Could not load unfinished page builds.", { cause: retryError });
  return <section className="mx-auto flex max-w-3xl flex-col gap-6">
    <header><Link className="text-sm text-zinc-500 hover:underline" href={`/dashboard/sites/${siteId}`}>{site.name || "Your site"}</Link>
      <h1 className="mt-2 text-2xl font-semibold">Build pages with AI</h1>
      <p className="mt-2 text-sm text-zinc-600">Create a new draft direction without changing your published pages.</p></header>
    <AiSiteWizard accounts={[]} unlimited={admin === true}
      pendingRetries={(retries as { retryId: string; pageId: string; slug: string; label: string | null }[]).map((retry) =>
        ({ ...retry, label: retry.label ?? defaultMenuLabel(retry.slug), built: false }))}
      existingSite={{ id: site.id, accountId: site.account_id, name: site.name ?? "",
      pages: pages.filter(({ slug }) => selectedSlugSchema.safeParse(slug).success).map(({ slug, nav_label, draft_data, published_data }) => ({
        slug, label: nav_label ?? defaultMenuLabel(slug), empty: isEmptyPage(draft_data) && (!published_data || isEmptyPage(published_data)),
      })),
      business: businessSchema.parse({ ...emptyBusiness, ...site.business }) }}
      rootDomain={brand.rootDomain} marketingSubdomain={brand.marketingSiteSubdomain} />
  </section>;
}
