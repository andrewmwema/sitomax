import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { domainRequestSchema, type DomainAssistanceData } from "./requests";

export async function loadDomainAssistance(siteId: string): Promise<DomainAssistanceData> {
  const { supabase } = await requireUser();
  const site = await supabase.from("sites").select("account_id").eq("id", siteId).maybeSingle();
  if (site.error || !site.data) throw new Error("Could not load domain request permissions.");
  const [owner, admin] = await Promise.all([
    supabase.rpc("is_account_owner", { acc: site.data.account_id }), supabase.rpc("is_super_admin"),
  ]);
  if (owner.error || admin.error || (!owner.data && !admin.data)) throw new Error("Only owners and agency admins can view domain requests.");
  const [agency, requests] = await Promise.all([
    supabase.from("agency_settings").select("support_email").eq("id", 1).maybeSingle(),
    supabase.from("domain_requests").select("id, site_id, domain, provider, status, notes, created_at")
      .eq("site_id", siteId).order("created_at", { ascending: false }),
  ]);
  if (agency.error || requests.error) throw new Error("Could not load domain help. Apply the domain requests migration and try again.");
  const email = z.email().safeParse(agency.data?.support_email);
  return { supportEmail: email.success ? email.data : null, canRequest: owner.data === true,
    isSuperAdmin: admin.data === true, requests: z.array(domainRequestSchema).parse(requests.data ?? []) };
}
