import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { linkContext, resolveDataLinks } from "@/lib/links";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import { TenantFontHints } from "@/components/tenant-font-hints";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { TenantTracking } from "@/components/tenant-tracking";
import { localBusinessJsonLd, parseSiteSeo, publicPageSeo } from "@/lib/seo-public";
import { absoluteImage, rootSeoSchema } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { businessSchema, emptyBusiness } from "@/lib/business";
import { pageMenuLinks, siteContacts, type SiteMenu } from "@/lib/page-navigation";
import { defaultHeader, headerSchema } from "@/lib/header";
import {
  getSiteByHost,
  getSitePage,
  getTenantLinkPages,
  getTenantMenuPages,
  type TenantPage,
  type TenantSite,
} from "@/lib/tenant";

/**
 * PUBLIC tenant site renderer. Reached only via the proxy rewrite:
 *   {subdomain}.ROOT_DOMAIN/{path}  ->  /s/{subdomain}/{path}
 *   {custom-domain}/{path}          ->  /s/{custom-domain}/{path}
 *
 * Renders pages.published_data with Puck. The site theme is passed as
 * Puck metadata and applied as CSS variables by the config's root.
 *
 * ?preview=1 renders draft_data instead, but only for signed-in members
 * of the site's account (verified through RLS with the user's session).
 */

type Props = PageProps<"/s/[site]/[[...slug]]">;

/**
 * True when the current visitor may see drafts of this page: RLS only
 * returns the row to members of the site's account or the super admin.
 */
const checkPageAccess = cache(async (pageId: string): Promise<{ allowed: boolean; failed: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .select("id")
    .eq("id", pageId)
    .maybeSingle();
  if (error) console.error("Could not check page access:", error.message);
  return { allowed: Boolean(data), failed: Boolean(error) };
});

async function loadPage(
  params: Props["params"],
  searchParams: Props["searchParams"],
): Promise<{
  site: TenantSite;
  page: TenantPage;
  data: Record<string, unknown>;
  isPreview: boolean;
} | null> {
  const [{ site: siteParam, slug }, { preview }] = await Promise.all([
    params,
    searchParams,
  ]);

  const site = await getSiteByHost(siteParam);
  if (!site) return null;

  const page = await getSitePage(site.id, slug?.join("/") ?? "");
  if (!page) return null;

  const isPreview =
    preview === "1" && page.draft_data != null && (await checkPageAccess(page.id)).allowed;
  const data = isPreview ? page.draft_data : page.published_data;
  if (!data) return null;

  return { site, page, data, isPreview };
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const loaded = await loadPage(params, searchParams);
  if (!loaded) return {};

  const { site, page } = loaded;
  const root = loaded.data.root;
  const preview = loaded.isPreview && root && typeof root === "object" && "props" in root
    ? rootSeoSchema.safeParse(root.props) : null;
  const previewSeo = preview?.success ? {
    title: preview.data.seoTitle || preview.data.title,
    description: preview.data.description,
    image: preview.data.socialImage,
    noindex: true,
  } : page.seo;
  const seo = publicPageSeo(site, { ...page, seo: previewSeo });
  const tenantIcon = typeof site.theme?.logoUrl === "string"
    ? absoluteImage(site.theme.logoUrl, seo.canonical)
    : undefined;

  return {
    metadataBase: new URL(seo.canonical),
    title: seo.title, description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: { type: "website", siteName: site.name || site.subdomain, title: seo.title, description: seo.description, url: seo.canonical, ...(seo.image ? { images: [seo.image] } : {}) },
    twitter: { card: seo.image ? "summary_large_image" : "summary", title: seo.title, description: seo.description, ...(seo.image ? { images: [seo.image] } : {}) },
    icons: { icon: tenantIcon ?? "/globe.svg" },
    robots: { index: !loaded.isPreview && !seo.noindex, follow: true },
    ...(seo.verification ? { verification: { google: seo.verification } } : {}),
  };
}

export default async function TenantSitePage({ params, searchParams }: Props) {
  const loaded = await loadPage(params, searchParams);
  if (!loaded) notFound();

  const { site, page, data, isPreview } = loaded;
  const { preview } = await searchParams;
  const access = preview !== "1" ? await checkPageAccess(page.id) : null;
  const track = access !== null && !access.allowed && !access.failed;
  const theme = ((isPreview ? site.draft_theme ?? site.theme : site.theme) ?? {}) as SiteTheme;
  const seo = parseSiteSeo(site);
  const jsonLd = JSON.stringify(localBusinessJsonLd(site)).replace(/</g, "\\u003c");
  const [menuPages, linkPages] = await Promise.all([
    getTenantMenuPages(site.id, isPreview),
    getTenantLinkPages(site.id, isPreview),
  ]);
  const contacts = siteContacts(businessSchema.parse({ ...emptyBusiness, ...site.business }));
  const previewPrefix = isPreview ? `/s/${encodeURIComponent((await params).site)}` : "";
  const siteMenu: SiteMenu = { links: pageMenuLinks(menuPages, previewPrefix), contacts };
  const rawHeader = isPreview ? site.draft_header : site.published_header;
  const siteHeader = site.headers_ready === false ? undefined :
    rawHeader ? headerSchema.parse(rawHeader) : defaultHeader(contacts.businessName || site.name || "", theme.logoUrl);
  // Typed page links are stored by id and resolved to current slugs here, so renames never break them.
  const pageData = resolveDataLinks({ content: [], root: {}, ...data }, linkContext(linkPages, previewPrefix));

  return (
    <>
      <TenantFontHints />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {preview !== "1" ? <TenantTracking seo={seo} /> : null}
      {track ? <AnalyticsBeacon key={page.id} /> : null}
      {isPreview ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Preview — showing unpublished draft
        </div>
      ) : null}
      <Render
        config={puckConfig}
        data={pageData as unknown as PuckPageData}
        metadata={{ theme, siteMenu, siteHeader, siteLinks: linkContext(linkPages, previewPrefix), pagePath: `${previewPrefix}/${page.slug}` }}
        // Disable Puck's default richtext transform (it injects the raw
        // HTML unsanitized); pass the string through so blocks render it
        // via <RichTextContent>, which sanitizes with DOMPurify.
        fieldTransforms={{ richtext: ({ value }) => value }}
      />
    </>
  );
}
