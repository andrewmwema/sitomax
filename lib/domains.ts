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
};

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };
export type DomainConnection = {
  status: "Pending" | "Connected" | "Needs attention";
  records: DnsRecord[];
  issue: string;
};
export type DomainSettingsState = {
  site: DomainSite | null;
  connection: DomainConnection | null;
  error: string;
  success: string;
};
