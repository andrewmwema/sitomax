import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { domainChecksExpired, type DomainSite, type DomainConnection } from "@/lib/domains";
import { getDomainConnection } from "@/lib/vercel/domains";

export const domainSiteColumns = "id, name, subdomain, custom_domain, domain_verified, domain_provider, domain_pending_since, domain_check_stopped_at";
export const expiredDomainIssue = "Automatic checks stopped after 14 days. Review your DNS records or contact your agency. You can still check manually.";
export class DomainCheckError extends Error {}

export async function checkAndSaveDomain(site: DomainSite, automatic: boolean): Promise<{ site: DomainSite; connection: DomainConnection }> {
  if (!site.custom_domain || !site.domain_pending_since) throw new DomainCheckError("Domain connection tracking is missing. Apply the domain wizard migration.");
  const domain = site.custom_domain;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const marked = await admin.from("sites").update({
    domain_last_checked_at: now,
    ...(automatic && domainChecksExpired(site) ? { domain_check_stopped_at: now } : {}),
  }).eq("id", site.id).eq("custom_domain", domain).eq("domain_pending_since", site.domain_pending_since)
    .eq("domain_verified", site.domain_verified).select("id").maybeSingle();
  if (marked.error || !marked.data) throw new DomainCheckError("The domain changed or its check time could not be saved. Refresh and try again.");
  if (automatic && domainChecksExpired(site)) return {
    site: { ...site, domain_check_stopped_at: now },
    connection: { status: "Needs attention", records: [], issue: expiredDomainIssue },
  };
  const connection = await getDomainConnection(domain, true);
  const saved = await admin.from("sites").update({
    domain_verified: connection.status === "Connected",
    ...(connection.status === "Connected" ? { domain_check_stopped_at: null } : {}),
  }).eq("id", site.id).eq("custom_domain", domain).eq("domain_pending_since", site.domain_pending_since)
    .eq("domain_verified", site.domain_verified)
    .select(domainSiteColumns).maybeSingle();
  if (saved.error || !saved.data) throw new DomainCheckError("Could not save the domain status. Refresh and try again.");
  return { site: saved.data, connection };
}
