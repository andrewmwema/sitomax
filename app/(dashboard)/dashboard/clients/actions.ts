"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/form-state";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { passwordEmail } from "@/lib/email/auth";

const createAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a client name.")
    .max(100, "Name is too long."),
});

export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireSuperAdmin();

  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { error } = await supabase
    .from("accounts")
    .insert({ name: parsed.data.name });

  if (error) {
    return { status: "error", message: "Could not create the account." };
  }

  revalidatePath("/dashboard/clients");
  return {
    status: "success",
    message: `Client "${parsed.data.name}" created.`,
  };
}

const inviteOwnerSchema = z.object({
  accountId: z.uuid(),
  email: z.email("Enter a valid email address."),
});

/**
 * Invites a user by email (or finds the existing user) and makes them an
 * owner of the given client account. Super admin only; uses the service
 * role for auth.admin and the membership insert.
 */
export async function inviteOwner(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = inviteOwnerSchema.safeParse({
    accountId: formData.get("accountId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { accountId, email } = parsed.data;
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("accounts")
    .select("id, is_internal").eq("id", accountId).maybeSingle();
  if (accountError) {
    console.error("Could not verify invitation account", accountError);
    return { status: "error", message: "Could not verify the client account. Please retry." };
  }
  if (!account || account.is_internal) {
    return { status: "error", message: "Invitations are only available for client accounts." };
  }

  let userId: string;
  let tokenHash: string | undefined;

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.generateLink({ type: "invite", email });

  if (inviteError) {
    if (inviteError.code !== "email_exists" && inviteError.code !== "user_already_exists") {
      console.error("Could not generate owner invitation", { code: inviteError.code, status: inviteError.status });
      return { status: "error", message: "Could not create an invitation. Please try again." };
    }
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!existing) {
      return {
        status: "error",
        message: "Could not invite this email. Please try again.",
      };
    }
    userId = existing.id;
  } else {
    tokenHash = inviteData.properties.hashed_token;
    if (!tokenHash) return { status: "error", message: "Could not create the invitation link. Please try again." };
    userId = inviteData.user.id;
  }

  const { error: memberError } = await admin
    .from("account_members")
    .upsert({ account_id: accountId, user_id: userId, role: "owner" });

  if (memberError) {
    return {
      status: "error",
      message: "Could not add this user to the account.",
    };
  }

  revalidatePath("/dashboard/clients");
  if (tokenHash) {
    try {
      await sendEmail({
        to: email, tag: "invite",
        ...(await passwordEmail("invite", tokenHash)),
        metadata: { account_id: accountId },
      });
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      return { status: "error", message: `Owner access was saved, but the invitation was not sent. ${error.message}` };
    }
  }
  return {
    status: "success",
    message: tokenHash
      ? `Invitation sent to ${email}.`
      : `${email} added as owner.`,
  };
}
