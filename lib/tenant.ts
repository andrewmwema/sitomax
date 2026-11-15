/**
 * Tenant resolution from the request hostname.
 *
 * Routing rules:
 * - Host = ROOT_DOMAIN or www.ROOT_DOMAIN -> agency app (no tenant).
 * - Host = {subdomain}.ROOT_DOMAIN        -> tenant key is the subdomain.
 * - Any other host                        -> tenant key is the full host
 *                                            (a custom domain).
 *
 * The /s/[site] renderer later resolves the key against sites.subdomain
 * first, then sites.custom_domain.
 */

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
