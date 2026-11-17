import { brand } from "@/lib/brand";

/** Public URL of a site: verified custom domain first, subdomain otherwise. */
export function getSiteUrl(site: {
  subdomain: string; custom_domain: string | null; domain_verified: boolean;
}): string {
  const root = brand.rootDomain;
  const host = site.custom_domain && site.domain_verified ? site.custom_domain : `${site.subdomain}.${root}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
