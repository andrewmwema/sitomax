"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/form-state";

const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

/**
 * Sets a new password for the signed-in user. Used after a password
 * reset and when an invited user first lands in the app.
 */
export async function setPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "same_password") {
      return {
        status: "error",
        message: "The new password must be different from your current one.",
      };
    }
    if (error.code === "weak_password") {
      return {
        status: "error",
        message: "That password is too weak. Please choose a stronger one.",
      };
    }
    return {
      status: "error",
      message: "We could not update your password. Please try again.",
    };
  }

  redirect("/dashboard");
}
