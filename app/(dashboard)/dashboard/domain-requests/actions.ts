"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { domainRequestStatusSchema } from "@/lib/domains/requests";
import { DomainEmailError } from "@/lib/domains/email";
import { notifyDomainRequestDone } from "@/lib/domains/request-email";

export async function updateDomainRequest(requestId: string, _previous: { error: string; success: string }, form: FormData) {
  const parsed = z.object({
    requestId: z.uuid(), status: domainRequestStatusSchema, notes: z.string().trim().max(1000),
  }).safeParse({ requestId, status: form.get("status"), notes: form.get("notes") });
  if (!parsed.success) return { error: "Choose a valid status and keep the client-visible update under 1,000 characters.", success: "" };
  const { supabase } = await requireSuperAdmin();
  const saved = await supabase.from("domain_requests").update({ status: parsed.data.status, notes: parsed.data.notes })
    .eq("id", parsed.data.requestId).select("site_id").maybeSingle();
  if (saved.error || !saved.data) return { error: "Could not update this request. It may have been removed or already have another open request.", success: "" };
  revalidatePath("/dashboard/domain-requests");
  revalidatePath(`/dashboard/sites/${saved.data.site_id}/domains`);
  if (parsed.data.status === "done") {
    try { await notifyDomainRequestDone(parsed.data.requestId); }
    catch (error) {
      if (!(error instanceof DomainEmailError)) throw error;
      console.error("Could not send domain request completion email", { requestId });
      return { error: `Status saved. ${error.message} The background job will retry the completion email.`, success: "" };
    }
  }
  return { error: "", success: "Request updated." };
}
