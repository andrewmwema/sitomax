"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { customDomainSchema, type DomainSettingsState, type DomainSite } from "@/lib/domains";
import { DomainApiError, ensureDomain, getDomainConnection, removeDomain } from "@/lib/vercel/domains";

const columns = "id, name, subdomain, custom_domain, domain_verified";

async function domainAccess(siteId: string): Promise<{ site: DomainSite } | { error: string }> {
  if (!z.uuid().safeParse(siteId).success) return { error: "Invalid site." };
  const { supabase } = await requireUser();
  const { data: site, error } = await supabase.from("sites")
    .select(`${columns}, account_id`).eq("id", siteId).maybeSingle();
  if (error) return { error: "Could not load domain settings." };
  if (!site) return { error: "You do not have access to this site." };
  const [admin, owner] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: site.account_id }),
  ]);
  if (admin.error || owner.error) return { error: "Could not check domain permissions." };
  if (!admin.data && !owner.data) return { error: "Only account owners can manage domains." };
  return { site: {
    id: site.id, name: site.name, subdomain: site.subdomain,
    custom_domain: site.custom_domain, domain_verified: site.domain_verified,
  } };
}

function state(site: DomainSite | null, error = "", success = ""): DomainSettingsState {
  return { site, connection: null, error, success };
}

function serviceError(error: unknown): string {
  if (!(error instanceof DomainApiError)) throw error;
  if (error.code === "not_configured" || error.status === 401 || error.status === 403) {
    return "Domain connections are not available. Ask your agency to check the hosting configuration.";
  }
  if (error.status === 409 || ["domain_already_in_use", "domain_already_exists"].includes(error.code)) {
    return "This domain already has another connection. Contact your agency for help.";
  }
  if (error.status === 429) return "Too many checks. Please wait a moment and try again.";
  return "Could not complete the domain request. Please try again or contact your agency.";
}

function refresh(site: DomainSite) {
  revalidatePath(`/dashboard/sites/${site.id}`);
  revalidatePath(`/dashboard/sites/${site.id}/domains`);
  revalidatePath("/dashboard");
  revalidatePath(`/s/${site.subdomain}`, "layout");
  if (site.custom_domain) revalidatePath(`/s/${site.custom_domain}`, "layout");
}

async function connectionState(site: DomainSite, verify = false): Promise<DomainSettingsState> {
  const result = state(site);
  if (!site.custom_domain) return result;
  result.connection = await getDomainConnection(site.custom_domain, verify);
  return result;
}

export async function loadDomainSettings(siteId: string): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  try {
    const result = await connectionState(access.site);
    if (result.connection?.status === "Connected" && !access.site.domain_verified) {
      result.connection = { ...result.connection, status: "Pending", issue: "DNS is ready. Click Check again to activate this domain." };
    }
    return result;
  } catch (error) {
    return state(access.site, serviceError(error));
  }
}

export async function connectSiteDomain(siteId: string, input: string): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  let site = access.site;
  const parsed = customDomainSchema.safeParse(input);
  if (!parsed.success) return state(site, parsed.error.issues[0].message);
  const domain = parsed.data;
  const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase().replace(/:\d+$/, "");
  if (domain === root || domain.endsWith(`.${root}`) || domain === "vercel.app" || domain.endsWith(".vercel.app")) {
    return state(site, "Use your own domain, not a platform address.");
  }
  if (site.custom_domain && site.custom_domain !== domain) {
    return state(site, "Remove the current domain before connecting another.");
  }

  // Domain columns are deliberately not writable by the authenticated DB role.
  const admin = createAdminClient();
  const conflict = await admin.from("sites").select("id")
    .in("custom_domain", [domain, `www.${domain}`]).neq("id", site.id);
  if (conflict.error) return state(site, "Could not check whether this domain is available.");
  if (conflict.data?.length) return state(site, "This domain is already connected to another site.");
  if (!site.custom_domain) {
    // Reserve the unique domain before making remote changes; failed setup stays retryable.
    const saved = await admin.from("sites").update({ custom_domain: domain, domain_verified: false })
      .eq("id", site.id).is("custom_domain", null).select(columns).maybeSingle();
    if (saved.error || !saved.data) return state(site, "Could not save this domain. It may already be connected. Refresh and try again.");
    site = saved.data;
    refresh(site);
  }
  try {
    await ensureDomain(domain);
    await ensureDomain(`www.${domain}`, domain);
    const result = await connectionState(site);
    const verified = result.connection?.status === "Connected";
    const saved = await admin.from("sites").update({ domain_verified: verified })
      .eq("id", site.id).eq("custom_domain", domain).select(columns).maybeSingle();
    if (saved.error || !saved.data) return { ...result, error: "Connection set up, but its status could not be saved. Check again." };
    result.site = saved.data;
    result.success = verified ? "Your domain is connected." : "Domain added. Update your DNS records below.";
    refresh(saved.data);
    return result;
  } catch (error) {
    return state(site, `${serviceError(error)} Your domain is saved; retry the connection to finish setup.`);
  }
}

export async function checkSiteDomain(siteId: string): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  const { site } = access;
  if (!site.custom_domain) return state(site, "Connect a domain first.");
  try {
    const result = await connectionState(site, true);
    const saved = await createAdminClient().from("sites")
      .update({ domain_verified: result.connection?.status === "Connected" })
      .eq("id", site.id).eq("custom_domain", site.custom_domain).select(columns).maybeSingle();
    if (saved.error || !saved.data) return { ...result, error: "Could not save the domain status. Refresh and try again." };
    result.site = saved.data;
    result.success = result.connection?.status === "Connected" ? "Your domain is connected." : "Checked. DNS changes may still be propagating.";
    refresh(saved.data);
    return result;
  } catch (error) {
    return state(site, serviceError(error));
  }
}

export async function removeSiteDomain(siteId: string): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  const { site } = access;
  if (!site.custom_domain) return state(site, "There is no custom domain to remove.");
  try {
    await removeDomain(`www.${site.custom_domain}`);
    await removeDomain(site.custom_domain);
  } catch (error) {
    return state(site, `${serviceError(error)} Removal is incomplete; retry to finish.`);
  }
  const saved = await createAdminClient().from("sites").update({ custom_domain: null, domain_verified: false })
    .eq("id", site.id).eq("custom_domain", site.custom_domain).select(columns).maybeSingle();
  if (saved.error || !saved.data) return state(site, "Hosting disconnected, but settings could not be cleared. Retry removal.");
  refresh(site);
  return state(saved.data, "", "Custom domain removed. Your platform address still works.");
}
