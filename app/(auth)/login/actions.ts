"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string };

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().startsWith("/").catch("/dashboard"),
});

/**
 * Signs in with email + password. Accounts are invite-only; there is no
 * public sign-up. Redirects into the app on success.
 */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? "/dashboard",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { email, password, next } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "invalid_credentials") {
      return { status: "error", message: "Incorrect email or password." };
    }
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email before signing in.",
      };
    }
    if (error.code === "over_request_rate_limit") {
      return {
        status: "error",
        message: "Too many attempts. Please wait a moment and try again.",
      };
    }
    return {
      status: "error",
      message: "We could not sign you in. Please try again.",
    };
  }

  redirect(next);
}
