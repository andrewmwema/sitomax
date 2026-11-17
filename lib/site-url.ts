/** Public URL of a site: verified custom domain first, subdomain otherwise. */
export function getSiteUrl(site: {
  subdomain: string; custom_domain: string | null; domain_verified: boolean;
}): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const host = site.custom_domain && site.domain_verified ? site.custom_domain : `${site.subdomain}.${root}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
