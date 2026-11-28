import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { brand, brandLogo } from "@/lib/brand";
import { getAgencySettings } from "@/lib/agency";
import { decryptProfileId, encryptProfileId } from "./encryption";
import { getSocialProvider, SocialProviderError } from "./provider";
import { connectedAccountSchema, socialPlatforms } from "./types";

export class SocialConnectionError extends Error {}

export async function socialAccess(accountId: string) {
  z.uuid().parse(accountId);
  const { supabase } = await requireUser();
  const [admin, owner, account] = await Promise.all([
    supabase.rpc("is_super_admin"), supabase.rpc("is_account_owner", { acc: accountId }),
    supabase.from("accounts").select("id, name").eq("id", accountId).maybeSingle(),
  ]);
  if (admin.error || owner.error || account.error) throw new SocialConnectionError("Could not check social account permissions.");
  if ((!admin.data && !owner.data) || !account.data) throw new SocialConnectionError("Only account owners can manage social connections.");
  return { supabase, account: account.data };
}

export async function socialContext(accountId: string) {
  const { supabase, account } = await socialAccess(accountId);
  const { data, error } = await supabase.rpc("social_connection_profile", { p_account_id: accountId });
  if (error) throw new SocialConnectionError(error.code === "P0001"
    ? "Social action limit reached. Wait a minute and try again."
    : "Could not load social connections. Ask your agency to apply migration 0070.");
  const profile = z.object({
    id: z.uuid(), encrypted_provider_profile_id: z.string().nullable(), requested_at: z.string(),
  }).parse(data);
  const provider = getSocialProvider(async (event) => {
    const logged = await supabase.rpc("log_social_provider_call", {
      p_account_id: accountId, p_action: event.action, p_ok: event.ok,
      p_http_status: event.httpStatus, p_error_code: event.errorCode,
    });
    if (logged.error) throw new SocialConnectionError("Could not save the social audit record. The request may have completed; check status before retrying.");
  });
  const context = `${accountId}:${profile.id}`;
  const expectedUsername = `sitomax_${profile.id.replaceAll("-", "")}`;
  // Generate ciphertext before remote creation so a missing encryption key fails locally.
  const ciphertext = profile.encrypted_provider_profile_id ?? encryptProfileId(expectedUsername, context);
  const username = profile.encrypted_provider_profile_id
    ? decryptProfileId(ciphertext, context) : expectedUsername;
  if (username !== expectedUsername) throw new SocialConnectionError("The social profile mapping is invalid. Contact your agency.");

  async function ensureProfile() {
    if (profile.encrypted_provider_profile_id) return;
    try { await provider.createProfile(username); }
    catch (error) {
      if (!(error instanceof SocialProviderError && error.status === 409)) throw error;
      // Creation may have succeeded before a timeout or during a competing request.
      await provider.listConnectedAccounts(username);
    }
    const saved = await supabase.rpc("save_social_profile_mapping", { p_profile_id: profile.id, p_ciphertext: ciphertext });
    if (saved.error) throw new SocialConnectionError("The social profile was created but could not be saved. Retry to finish setup.");
    profile.encrypted_provider_profile_id = ciphertext;
  }
  return { supabase, account, profile, provider, username, ensureProfile };
}

export async function connectSocialAccount(accountId: string) {
  const context = await socialContext(accountId);
  await context.ensureProfile();
  const agency = await getAgencySettings();
  const redirect = new URL("/social/connected", brand.appUrl);
  redirect.searchParams.set("account", accountId);
  const result = await context.provider.getConnectUrl(context.username, {
    redirectUrl: redirect.href, platforms: [...socialPlatforms],
    logoUrl: new URL(agency.logoUrl ?? brandLogo.full.path, brand.appUrl).href,
    title: `Connect your social accounts to ${agency.name}`,
  });
  return result;
}

export async function syncSocialAccount(accountId: string) {
  const context = await socialContext(accountId);
  if (!context.profile.encrypted_provider_profile_id) throw new SocialConnectionError("Connect your accounts first.");
  const result = await context.provider.listConnectedAccounts(context.username);
  const saved = await context.supabase.rpc("sync_social_accounts", {
    p_profile_id: context.profile.id, p_started_at: context.profile.requested_at,
    p_accounts: result.data,
  });
  if (saved.error) throw new SocialConnectionError("Accounts were loaded but their status could not be saved. Try syncing again.");
  return result;
}

export async function loadSocialAccounts(accountId: string) {
  const { supabase } = await socialAccess(accountId);
  const { data, error } = await supabase.from("social_accounts")
    .select("platform, display_name, avatar_url, status").eq("account_id", accountId).order("platform");
  if (error) throw new SocialConnectionError("Could not load connected accounts. Ask your agency to apply migration 0070.");
  return (data ?? []).map((item) => connectedAccountSchema.parse({
    platform: item.platform, displayName: item.display_name, avatarUrl: item.avatar_url, status: item.status,
  }));
}

export function socialUserError(error: unknown): string {
  if (error instanceof SocialProviderError || error instanceof SocialConnectionError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid social request.";
  throw error;
}
