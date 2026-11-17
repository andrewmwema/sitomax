import { cache } from "react";
import type { Metadata } from "next";
import { z } from "zod";
import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import { TenantFontHints } from "@/components/tenant-font-hints";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { createClient } from "@/lib/supabase/server";
import {
  getSiteByHost,
  getSitePage,
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

type PageSeo = {
  title?: string;
  description?: string;
};

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
  const preview = loaded.isPreview ? z.object({
    root: z.object({ props: z.object({ title: z.string().optional(), description: z.string().optional() }).optional() }).optional(),
  }).safeParse(loaded.data).data?.root?.props : undefined;
  const seo = (preview ?? page.seo ?? {}) as PageSeo;
  const title = seo.title || page.title || site.name || site.subdomain;

  return {
    title,
    description: seo.description || undefined,
    ...(loaded.isPreview ? { robots: { index: false } } : {}),
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

  return (
    <>
      <TenantFontHints />
      {track ? <AnalyticsBeacon key={page.id} /> : null}
      {isPreview ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Preview — showing unpublished draft
        </div>
      ) : null}
      <Render
        config={puckConfig}
        data={{ content: [], root: {}, ...data } as unknown as PuckPageData}
        metadata={{ theme }}
        // Disable Puck's default richtext transform (it injects the raw
        // HTML unsanitized); pass the string through so blocks render it
        // via <RichTextContent>, which sanitizes with DOMPurify.
        fieldTransforms={{ richtext: ({ value }) => value }}
      />
    </>
  );
}
