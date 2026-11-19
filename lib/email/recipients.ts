import "server-only";

import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";
import { EmailDeliveryError } from "./errors";

export async function getAccountOwnerEmails(admin: ReturnType<typeof createAdminClient>, accountId: string): Promise<string[]> {
  const members = await admin.from("account_members").select("user_id").eq("account_id", accountId).eq("role", "owner");
  if (members.error || !members.data?.length) throw new EmailDeliveryError("No account owner could be found for the email.");
  const profiles = await admin.from("profiles").select("email").in("id", members.data.map((member) => member.user_id));
  if (profiles.error) throw new EmailDeliveryError("Could not load email recipients.");
  const recipients = [...new Set((profiles.data ?? []).map((profile) => profile.email))]
    .filter((email): email is string => z.email().safeParse(email).success).sort();
  if (!recipients.length || recipients.length > 50) throw new EmailDeliveryError("Check the account owners' email addresses before sending.");
  return recipients;
}
