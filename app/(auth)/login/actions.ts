"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/auth";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  next: z.string().startsWith("/").catch("/dashboard"),
});

/**
 * Sends a magic sign-in link. Only existing (invited) users can sign in;
 * unknown emails still get a generic success message so the form cannot
 * be used to enumerate accounts.
 */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? "/dashboard",
  });

  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const { email, next } = parsed.data;
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  // "Signups not allowed" means the email has no account; report generic
  // success anyway. Surface every other failure.
  if (error && !/signup/i.test(error.message)) {
    return {
      status: "error",
      message: "We could not send the sign-in link. Please try again.",
    };
  }

  return { status: "sent", email };
}
