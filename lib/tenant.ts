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
import { headerMigrationMissing } from "@/lib/header";
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
  draft_header?: unknown;
  published_header?: unknown;
  headers_ready?: boolean;
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
  "id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme, draft_header, published_header, business, seo";
const LEGACY_SITE_COLUMNS =
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

    let columns: typeof SITE_COLUMNS | typeof LEGACY_SITE_COLUMNS = SITE_COLUMNS;
    let headersReady = true;
    const subdomain = await supabase
      .from("sites")
      .select(SITE_COLUMNS)
      .eq("subdomain", key)
      .maybeSingle();
    let bySubdomain: TenantSite | null = subdomain.data as TenantSite | null;
    if (headerMigrationMissing(subdomain.error)) {
      console.warn("Global header migration is not applied; preserving legacy Navigation rendering.");
      headersReady = false; columns = LEGACY_SITE_COLUMNS;
      const legacy = await supabase.from("sites").select(LEGACY_SITE_COLUMNS).eq("subdomain", key).maybeSingle();
      if (legacy.error) throw new Error("Unable to load the legacy site.", { cause: legacy.error });
      bySubdomain = legacy.data;
    } else if (subdomain.error) throw new Error("Unable to load the site.", { cause: subdomain.error });
    if (bySubdomain) return { ...bySubdomain, headers_ready: headersReady } as TenantSite;

    // Custom domains never include a port; strip one left over from dev hosts.
    const domain = key.replace(/:\d+$/, "");
    const domainResult = await supabase
      .from("sites")
      .select(columns)
      .eq("custom_domain", domain)
      .eq("domain_verified", true)
      .maybeSingle();
    if (domainResult.error) throw new Error("Unable to load the custom-domain site.", { cause: domainResult.error });
    const byDomain = domainResult.data as TenantSite | null;
    return byDomain ? { ...byDomain, headers_ready: headersReady } as TenantSite : null;
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

/** Every linkable page (menu-hidden ones included), for resolving typed page links by id. */
export async function getTenantLinkPages(siteId: string, preview: boolean) {
  const supabase = createAdminClient();
  const query = supabase.from("pages").select("id, slug").eq("site_id", siteId);
  const { data, error } = await (preview ? query : query.not("published_data", "is", null));
  if (error) throw new Error("Could not load tenant pages.", { cause: error });
  return data;
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
