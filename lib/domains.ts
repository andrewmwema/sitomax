import { z } from "zod";

export const customDomainSchema = z.string().trim().toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/^(www\.)+/, ""))
  .pipe(z.string().max(249).regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/,
    "Enter a domain such as example.com, without a path, port or query string.",
  ));

export type DomainSite = {
  id: string;
  name: string | null;
  subdomain: string;
  custom_domain: string | null;
  domain_verified: boolean;
  domain_provider: string | null;
  domain_pending_since: string | null;
  domain_check_stopped_at: string | null;
};

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };
export type DomainConnection = {
  status: "Pending" | "Connected" | "Needs attention";
  records: DnsRecord[];
  issue: string;
  acceptableRecords?: DnsRecord[];
};
export type DomainSettingsState = {
  site: DomainSite | null;
  connection: DomainConnection | null;
  error: string;
  success: string;
  inspection?: DnsInspection;
  conflicts?: DnsRecord[];
};

export type DnsInspection = {
  domain: string;
  providerId: string;
  nameservers: string[];
  records: DnsRecord[];
};

export function domainChecksExpired(site: Pick<DomainSite, "domain_pending_since" | "domain_check_stopped_at" | "domain_verified">, now = Date.now()) {
  return !site.domain_verified && Boolean(site.domain_check_stopped_at ||
    (site.domain_pending_since && now - Date.parse(site.domain_pending_since) >= 14 * 24 * 60 * 60 * 1000));
}
