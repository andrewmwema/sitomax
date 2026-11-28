"use server";

import { revalidatePath } from "next/cache";
import { connectSocialAccount, loadSocialAccounts, socialUserError, syncSocialAccount } from "@/lib/social/connections";
import type { ConnectedAccount } from "@/lib/social/types";

export async function connectAccounts(accountId: string): Promise<{ url?: string; error?: string }> {
  try {
    const result = await connectSocialAccount(accountId);
    return { url: result.data.url };
  } catch (error) { return { error: socialUserError(error) }; }
}

export async function syncAccounts(accountId: string): Promise<{ accounts?: ConnectedAccount[]; error?: string }> {
  try {
    await syncSocialAccount(accountId);
    const accounts = await loadSocialAccounts(accountId);
    revalidatePath("/dashboard/social");
    return { accounts };
  } catch (error) { return { error: socialUserError(error) }; }
}
