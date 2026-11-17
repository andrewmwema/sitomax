import "server-only";

import { promises as dns } from "node:dns";
import { customDomainSchema, type DnsInspection, type DnsRecord } from "@/lib/domains";
import { providerFromNameservers } from "./providers";

export class DnsLookupError extends Error {}

async function lookup<T>(operation: () => Promise<T[]>, consume: () => Promise<void>): Promise<T[]> {
  await consume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(), new Promise<T[]>((_, reject) => {
      timer = setTimeout(() => reject(new DnsLookupError("DNS timed out. Please try again in a moment.")), 10_000);
    })]);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : "";
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    if (["ETIMEOUT", "ESERVFAIL", "EREFUSED", "ECONNREFUSED", "ECANCELLED"].includes(String(code))) {
      throw new DnsLookupError("DNS could not be reached. Please try again in a moment.");
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export async function inspectDns(input: string, consume: () => Promise<void>): Promise<DnsInspection> {
  const domain = customDomainSchema.parse(input);
  const nameservers = await lookup(() => dns.resolveNs(domain), consume);
  const results = await Promise.all([domain, `www.${domain}`].map(async (name) => {
    const [addresses, aliases] = await Promise.all([
      lookup(() => dns.resolve4(name), consume), lookup(() => dns.resolveCname(name), consume),
    ]);
    return [
      ...addresses.map((value): DnsRecord => ({ type: "A", name, value })),
      ...aliases.map((value): DnsRecord => ({ type: "CNAME", name, value: value.toLowerCase().replace(/\.$/, "") })),
    ];
  }));
  return { domain, providerId: providerFromNameservers(nameservers).id, nameservers, records: results.flat() };
}

export function conflictingRecords(inspection: DnsInspection, recommended: DnsRecord[]): DnsRecord[] {
  const ips = new Set(recommended.filter((record) => record.type === "A").map((record) => record.value));
  const aliases = new Set(recommended.filter((record) => record.type === "CNAME").map((record) =>
    record.value.toLowerCase().replace(/\.$/, "")));
  const rootIsReady = inspection.records.some((record) => record.type === "A" &&
    record.name === inspection.domain && ips.has(record.value));
  return inspection.records.filter((record) => {
    // Resolved A records behind a CNAME are not editable A records.
    if (record.type === "A") return ips.size > 0 && !ips.has(record.value) &&
      !inspection.records.some((other) => other.type === "CNAME" && other.name === record.name);
    return record.type === "CNAME" && aliases.size > 0 && !aliases.has(record.value) &&
      !(record.name === `www.${inspection.domain}` && record.value === inspection.domain && rootIsReady);
  });
}
