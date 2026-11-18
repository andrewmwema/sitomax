import { brand } from "@/lib/brand";

export const RESERVED_SUBDOMAINS = new Set([
  "app", "www", "api", "admin", "mail", "email", "smtp", "help", "support",
  "docs", "blog", "status", "dashboard", "login", "auth", "cdn", "static",
  "assets", "billing", "dev", "staging", "test", "ns1", "ns2",
]);

export function isReservedSubdomain(subdomain: string): boolean {
  const normalized = subdomain.toLowerCase();
  return RESERVED_SUBDOMAINS.has(normalized) || normalized === brand.marketingSiteSubdomain;
}

export function isReservedForAccountSite(subdomain: string, isSuperAdmin: boolean, isInternal = false): boolean {
  return isReservedSubdomain(subdomain) &&
    !(isSuperAdmin && isInternal && subdomain.toLowerCase() === brand.marketingSiteSubdomain);
}
