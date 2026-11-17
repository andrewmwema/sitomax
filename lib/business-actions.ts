"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { businessSchema } from "@/lib/business";

export async function saveBusinessInfo(siteId: string, value: unknown) {
  const parsed = z.object({ siteId: z.uuid(), business: businessSchema }).safeParse({ siteId, business: value });
  if (!parsed.success) return { status: "error" as const, message: parsed.error.issues[0]?.message ?? "Invalid business information." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("sites")
    .update({ business: parsed.data.business }).eq("id", parsed.data.siteId).select("id");
  if (error || !data?.length) {
    console.error("Could not save business information", { code: error?.code });
    return { status: "error" as const, message: "Could not save business information. Please retry." };
  }
  return { status: "success" as const, business: parsed.data.business };
}
