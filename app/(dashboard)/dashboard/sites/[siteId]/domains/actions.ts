"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { customDomainSchema, domainChecksExpired, type DnsInspection, type DomainSettingsState, type DomainSite } from "@/lib/domains";
import { DomainApiError, getDomainConnection, removeDomain } from "@/lib/vercel/domains";
import { conflictingRecords, DnsLookupError, inspectDns } from "@/lib/domains/dns";
import { providerIdSchema } from "@/lib/domains/providers";
import { checkAndSaveDomain, DomainCheckError, domainSiteColumns, expiredDomainIssue } from "@/lib/domains/check";
import { DomainEmailError, instructionEmail, notifyDomainLive, sendDomainEmail } from "@/lib/domains/email";
import { EmailDeliveryError } from "@/lib/email";
import { brand } from "@/lib/brand";
import { getProvider } from "@/lib/domains/providers";
import { renderDomainInstructionsEmail } from "@/emails/registry";

const columns = domainSiteColumns;

async function domainAccess(siteId: string): Promise<
  { site: DomainSite; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"] } | { error: string }
> {
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
    domain_provider: site.domain_provider, domain_pending_since: site.domain_pending_since,
    domain_check_stopped_at: site.domain_check_stopped_at,
  } satisfies DomainSite, supabase };
}

function state(site: DomainSite | null, error = "", success = ""): DomainSettingsState {
  return { site, connection: null, error, success };
}

function serviceError(error: unknown): string {
  if (error instanceof DnsLookupError || error instanceof DomainEmailError || error instanceof DomainCheckError || error instanceof EmailDeliveryError) return error.message;
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

async function connectionState(site: DomainSite): Promise<DomainSettingsState> {
  const result = state(site);
  if (!site.custom_domain) return result;
  if (domainChecksExpired(site)) {
    result.connection = { status: "Needs attention", records: [], issue: expiredDomainIssue };
    return result;
  }
  result.connection = await getDomainConnection(site.custom_domain);
  return result;
}

async function consumeAction(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], kind: "dns" | "email") {
  const { data, error } = await supabase.rpc("consume_domain_action", { p_kind: kind, p_cost: 1 });
  if (error) throw new DnsLookupError("Could not check the request limit. Ask your agency to apply the domain wizard migration.");
  if (data !== true) throw new DnsLookupError(kind === "dns"
    ? "DNS lookup limit reached (20 per minute). Please wait a minute and try again."
    : "Email limit reached (3 per minute). Please wait a minute and try again.");
}

async function withInspection(result: DomainSettingsState, supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  if (!result.site?.custom_domain) return result;
  try {
    result.inspection = await inspectDns(result.site.custom_domain, () => consumeAction(supabase, "dns"));
    result.conflicts = conflictingRecords(result.inspection, result.connection?.acceptableRecords ?? result.connection?.records ?? []);
  } catch (error) {
    if (!(error instanceof DnsLookupError)) throw error;
    result.error = [result.error, error.message].filter(Boolean).join(" ");
  }
  return result;
}

export async function inspectSiteDomain(siteId: string, input: string): Promise<{ inspection?: DnsInspection; error: string }> {
  const access = await domainAccess(siteId);
  if ("error" in access) return { error: access.error };
  const parsed = customDomainSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    return { inspection: await inspectDns(parsed.data, () => consumeAction(access.supabase, "dns")), error: "" };
  } catch (error) { return { error: serviceError(error) }; }
}

export async function loadDomainSettings(siteId: string): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  try {
    const result = await connectionState(access.site);
    if (result.connection?.status === "Connected" && !access.site.domain_verified) {
      result.connection = { ...result.connection, status: "Pending", issue: "DNS is ready. Click Check again to activate this domain." };
    }
    return domainChecksExpired(access.site) ? result : await withInspection(result, access.supabase);
  } catch (error) {
    return state(access.site, serviceError(error));
  }
}

export async function connectSiteDomain(siteId: string, input: string, providerId = "other"): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  let site = access.site;
  const parsed = customDomainSchema.safeParse(input);
  if (!parsed.success) return state(site, parsed.error.issues[0].message);
  const provider = providerIdSchema.safeParse(providerId);
  if (!provider.success) return state(site, "Choose a DNS provider.");
  const domain = parsed.data;
  const root = (process.env.ROOT_DOMAIN ?? brand.rootDomain).toLowerCase().replace(/:\d+$/, "");
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
  const providerSaved = await admin.from("sites").update({ domain_provider: provider.data })
    .eq("id", site.id).eq("custom_domain", domain).select(columns).maybeSingle();
  if (providerSaved.error || !providerSaved.data) return state(site, "Could not save your DNS provider. Refresh and try again.");
  site = providerSaved.data;
  try {
    const result = { ...state(site), connection: await getDomainConnection(domain, { verify: true, repair: true }) };
    const verified = result.connection?.status === "Connected";
    const saved = await admin.from("sites").update({ domain_verified: verified })
      .eq("id", site.id).eq("custom_domain", domain).select(columns).maybeSingle();
    if (saved.error || !saved.data) return { ...result, error: "Connection set up, but its status could not be saved. Check again." };
    result.site = saved.data;
    result.success = verified ? "Your domain is connected." :
      result.connection.status === "Pending" ? "Update your DNS records below." : "";
    refresh(saved.data);
    try { if (verified) await notifyDomainLive(site.id); }
    catch (error) { result.error = serviceError(error); }
    return await withInspection(result, access.supabase);
  } catch (error) {
    return state(site, `${serviceError(error)} Your domain is saved; retry the connection to finish setup.`);
  }
}

export async function checkSiteDomain(siteId: string, automatic = false): Promise<DomainSettingsState> {
  const access = await domainAccess(siteId);
  if ("error" in access) return state(null, access.error);
  const { site } = access;
  if (!site.custom_domain) return state(site, "Connect a domain first.");
  if (!z.boolean().safeParse(automatic).success) return state(site, "Invalid check.");
  try {
    const checked = await checkAndSaveDomain(site, automatic);
    const result = { ...state(checked.site), connection: checked.connection };
    result.success = result.connection.status === "Connected" ? "Your domain is connected." :
      result.connection.status === "Pending" ? "Checked. DNS changes may still be propagating." : "";
    if (site.domain_verified !== checked.site.domain_verified) refresh(checked.site);
    try { if (checked.site.domain_verified) await notifyDomainLive(site.id); }
    catch (error) { result.error = serviceError(error); }
    return automatic && domainChecksExpired(checked.site) ? result : await withInspection(result, access.supabase);
  } catch (error) {
    return state(site, serviceError(error));
  }
}

export async function emailDomainInstructions(siteId: string, email: string, providerId: string): Promise<{ error: string; success: string }> {
  const access = await domainAccess(siteId);
  if ("error" in access) return { error: access.error, success: "" };
  const parsed = z.object({ email: z.email().max(254), providerId: providerIdSchema }).safeParse({ email, providerId });
  if (!parsed.success) return { error: "Enter a valid email address and DNS provider.", success: "" };
  if (!access.site.custom_domain) return { error: "Connect a domain first.", success: "" };
  try {
    await consumeAction(access.supabase, "email");
    const connection = await getDomainConnection(access.site.custom_domain);
    if (!connection.records.some((record) => record.type === "A") || !connection.records.some((record) => record.type === "CNAME")) {
      return { error: "DNS instructions are incomplete. Retry the connection first.", success: "" };
    }
    const text = instructionEmail(access.site.custom_domain, parsed.data.providerId, connection.records);
    const provider = getProvider(parsed.data.providerId);
    const rendered = await renderDomainInstructionsEmail({
      domain: access.site.custom_domain,
      providerName: provider.name,
      steps: provider.steps,
      records: [...connection.records],
      dnsUrl: provider.dnsUrl,
    });
    rendered.text = text;
    await sendDomainEmail([parsed.data.email], rendered.subject, rendered,
      `instructions:${siteId}:${parsed.data.email}:${Math.floor(Date.now() / 60_000)}:${text}`);
    return { error: "", success: "Instructions sent." };
  } catch (error) { return { error: serviceError(error), success: "" }; }
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
