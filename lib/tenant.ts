/**
 * Tenant resolution from the request hostname.
 *
 * Routing rules:
 * - Host = ROOT_DOMAIN or www.ROOT_DOMAIN -> marketing tenant.
 * - Host = {subdomain}.ROOT_DOMAIN        -> tenant key is the subdomain.
 * - Any other host                        -> tenant key is the full host
 *                                            (a custom domain).
 *
 * The /s/[site] renderer resolves the key with getSiteByHost against
 * sites.subdomain first, then sites.custom_domain.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { brand } from "@/lib/brand";
export { getSiteUrl } from "@/lib/site-url";

export function getRootDomain(): string {
  return process.env.ROOT_DOMAIN ?? brand.rootDomain;
}

/**
 * Returns the tenant key for a hostname. The apex and www hosts resolve to
 * the configured marketing tenant; app hosts are routed before this helper.
 */
export function getTenantKeyFromHost(host: string): string | null {
  const root = getRootDomain().toLowerCase();
  const rootHost = root.replace(/:\d+$/, "");
  const normalizedHost = host.toLowerCase().replace(/:\d+$/, "");

  if (normalizedHost === rootHost || normalizedHost === `www.${rootHost}`) {
    return brand.marketingSiteSubdomain;
  }

  if (normalizedHost.endsWith(`.${rootHost}`)) {
    return normalizedHost.slice(0, -(rootHost.length + 1));
  }

  // Anything else is treated as a custom domain.
  return normalizedHost;
}

export type TenantSite = {
  id: string;
  account_id: string;
  name: string | null;
  subdomain: string;
  custom_domain: string | null;
  domain_verified: boolean;
  theme: Record<string, unknown>;
  draft_theme?: Record<string, unknown> | null;
  business: Record<string, unknown>;
  seo: Record<string, unknown>;
};

export type TenantPage = {
  id: string;
  site_id: string;
  slug: string;
  title: string | null;
  draft_data: Record<string, unknown> | null;
  published_data: Record<string, unknown> | null;
  published_at: string | null;
  seo: Record<string, unknown>;
};

const SITE_COLUMNS =
  "id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme, business, seo";

/**
 * Resolves the tenant key from the /s/[site] segment to a site row.
 * Checks sites.subdomain first, then sites.custom_domain (only when the
 * domain is verified). Deduplicated per request with React cache().
 */
export const getSiteByHost = cache(
  async (siteParam: string): Promise<TenantSite | null> => {
    const key = siteParam.toLowerCase();
    const supabase = createAdminClient();

    const { data: bySubdomain } = await supabase
      .from("sites")
      .select(SITE_COLUMNS)
      .eq("subdomain", key)
      .maybeSingle();
    if (bySubdomain) return bySubdomain as TenantSite;

    // Custom domains never include a port; strip one left over from dev hosts.
    const domain = key.replace(/:\d+$/, "");
    const { data: byDomain } = await supabase
      .from("sites")
      .select(SITE_COLUMNS)
      .eq("custom_domain", domain)
      .eq("domain_verified", true)
      .maybeSingle();
    return (byDomain as TenantSite | null) ?? null;
  },
);

/**
 * Loads a site's page by slug ('' = home). Deduplicated per request with
 * React cache() so generateMetadata and the page share one query.
 */
export const getSitePage = cache(
  async (siteId: string, slug: string): Promise<TenantPage | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("pages")
      .select("id, site_id, slug, title, draft_data, published_data, published_at, seo")
      .eq("site_id", siteId)
      .eq("slug", slug)
      .maybeSingle();
    return (data as TenantPage | null) ?? null;
  },
);

export async function getPublishedSitePages(siteId: string): Promise<Pick<TenantPage, "slug" | "seo" | "published_at">[]> {
  const supabase = createAdminClient();
  const pages: Pick<TenantPage, "slug" | "seo" | "published_at">[] = [];
  while (true) {
    const { data, error } = await supabase.from("pages").select("slug, seo, published_at")
      .eq("site_id", siteId).not("published_data", "is", null).order("slug").range(pages.length, pages.length + 499);
    if (error) throw new Error("Could not load published pages.", { cause: error });
    if (!data?.length) return pages;
    pages.push(...data);
  }
}

export async function getTenantMenuPages(siteId: string, preview: boolean) {
  const supabase = createAdminClient();
  const query = supabase.from("pages").select("slug, nav_label").eq("site_id", siteId).eq("hide_from_menu", false).order("sort_order").order("slug");
  const result = await (preview ? query.eq("ai_pending_build", false) : query.not("published_data", "is", null));
  if (result.error?.code === "42703") {
    console.warn("Page menu labels migration is not applied; using labels from slugs.");
    const legacyQuery = supabase.from("pages").select("slug").eq("site_id", siteId).order("sort_order").order("slug");
    const legacy = await (preview ? legacyQuery : legacyQuery.not("published_data", "is", null));
    if (legacy.error) throw new Error("Could not load tenant menu.", { cause: legacy.error });
    return legacy.data.map(({ slug }) => ({ slug, nav_label: null }));
  }
  const { data, error } = result;
  if (error) throw new Error("Could not load tenant menu.", { cause: error });
  return data;
}
