/**
 * Tenant resolution from the request hostname.
 *
 * Routing rules:
 * - Host = ROOT_DOMAIN or www.ROOT_DOMAIN -> agency app (no tenant).
 * - Host = {subdomain}.ROOT_DOMAIN        -> tenant key is the subdomain.
 * - Any other host                        -> tenant key is the full host
 *                                            (a custom domain).
 *
 * The /s/[site] renderer resolves the key with getSiteByHost against
 * sites.subdomain first, then sites.custom_domain.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

function rootDomain(): string {
  return process.env.ROOT_DOMAIN ?? "localhost:3000";
}

/**
 * Public URL of a site: verified custom domain first, subdomain otherwise.
 * Uses NEXT_PUBLIC_ROOT_DOMAIN so it also works in Client Components.
 */
export function getSiteUrl(site: {
  subdomain: string;
  custom_domain: string | null;
  domain_verified: boolean;
}): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const host =
    site.custom_domain && site.domain_verified
      ? site.custom_domain
      : `${site.subdomain}.${root}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Returns the tenant key for a hostname, or null when the host is the
 * agency's own root domain (marketing site + dashboard).
 */
export function getTenantKeyFromHost(host: string): string | null {
  const root = rootDomain();
  const normalizedHost = host.toLowerCase();

  if (normalizedHost === root || normalizedHost === `www.${root}`) {
    return null;
  }

  if (normalizedHost.endsWith(`.${root}`)) {
    return normalizedHost.slice(0, -(root.length + 1));
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
  "id, account_id, name, subdomain, custom_domain, domain_verified, theme, draft_theme";

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
