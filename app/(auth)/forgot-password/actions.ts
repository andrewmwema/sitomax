"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/auth";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address."),
});

/**
 * Sends a password reset email. Unknown emails still get a generic
 * success message so the form cannot be used to enumerate accounts.
 */
export async function sendPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const { email } = parsed.data;
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/set-password`,
  });

  if (error?.code === "over_email_send_rate_limit") {
    return {
      status: "error",
      message: "Too many requests. Please wait a moment and try again.",
    };
  }

  return { status: "sent", email };
}
