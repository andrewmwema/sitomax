"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { customDomainSchema } from "@/lib/domains";
import { providerIdSchema } from "@/lib/domains/providers";

export async function createDomainRequest(siteId: string, _previous: { error: string; success: string }, form: FormData) {
  const parsed = z.object({
    siteId: z.uuid(), domain: customDomainSchema, provider: providerIdSchema,
    invited: z.literal("on"),
  }).safeParse({ siteId, domain: form.get("domain"), provider: form.get("provider"), invited: form.get("invited") });
  if (!parsed.success) return { error: "Enter a valid domain and provider, and confirm you have sent the safe access invitation.", success: "" };
  const { supabase, user } = await requireUser();
  const site = await supabase.from("sites").select("account_id").eq("id", parsed.data.siteId).maybeSingle();
  if (site.error || !site.data) return { error: "You do not have access to this site.", success: "" };
  const owner = await supabase.rpc("is_account_owner", { acc: site.data.account_id });
  if (owner.error || owner.data !== true) return { error: "Only account owners can request domain setup.", success: "" };
  const agency = await supabase.from("agency_settings").select("support_email").eq("id", 1).maybeSingle();
  if (agency.error || !z.email().safeParse(agency.data?.support_email).success) {
    return { error: "Ask your agency to configure its support email before requesting delegated setup.", success: "" };
  }
  const saved = await supabase.from("domain_requests").insert({
    site_id: parsed.data.siteId, domain: parsed.data.domain, provider: parsed.data.provider, created_by: user.id,
  }).select("id").maybeSingle();
  if (saved.error?.code === "23505") return { error: "An open request already exists for this domain. Check its status below.", success: "" };
  if (saved.error || !saved.data) return { error: "Could not submit the request. Check that the domain requests migration has been applied.", success: "" };
  revalidatePath(`/dashboard/sites/${parsed.data.siteId}/domains`);
  revalidatePath("/dashboard/domain-requests");
  return { error: "", success: "Request sent. Your account owners can track its status below." };
}
