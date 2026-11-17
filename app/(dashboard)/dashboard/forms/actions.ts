"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export async function markSubmissionRead(_previous: { error: string }, formData: FormData) {
  const parsed = z.uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "Invalid submission." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("form_submissions")
    .update({ is_read: true }).eq("id", parsed.data).select("id");
  if (error || !data?.length) {
    console.error("Could not mark submission as read:", error?.message ?? "No accessible submission.");
    return { error: "Could not mark this submission as read." };
  }
  revalidatePath("/dashboard", "layout");
  return { error: "" };
}
