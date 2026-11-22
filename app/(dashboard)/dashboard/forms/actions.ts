"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { leadStatusSchema, selectedLeadIdsSchema } from "@/lib/forms/submissions";

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

export async function markLeadViewed(raw: unknown) {
  const parsed = z.object({ id: z.uuid(), lastActivity: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return { error: "Could not mark this lead as read. Refresh and try again." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("form_submissions").update({ is_read: true })
    .eq("id", parsed.data.id).eq("last_activity_at", parsed.data.lastActivity).select("id");
  if (error || !data?.length) {
    console.error("Could not automatically mark lead as read", { code: error?.code ?? "changed_or_unavailable" });
    return { error: "Could not mark this lead as read. Refresh and try again." };
  }
  revalidatePath("/dashboard", "layout");
  return { error: "" };
}

export async function updateLeads(_previous: { error: string; success?: string }, formData: FormData) {
  const parsed = selectedLeadIdsSchema.safeParse(formData.getAll("id"));
  if (!parsed.success) return { error: "Select one or more leads on this page." };
  const ids = [...new Set(parsed.data)];
  const intent = formData.get("intent");
  const { supabase } = await requireUser();
  if (intent === "export") redirect(`/dashboard/forms/export?${new URLSearchParams(ids.map((id) => ["id", id]))}`);
  const status = leadStatusSchema.safeParse(formData.get("status"));
  const update = intent === "archive" || intent === "restore" ? { archived: intent === "archive" }
    : intent === "status" && status.success ? { status: status.data } : null;
  if (!update) return { error: "Choose a valid lead action and status." };
  const { data, error } = await supabase.from("form_submissions").update(update).in("id", ids).select("id");
  if (error) {
    console.error("Could not update leads", { code: error.code });
    return { error: "Could not update the selected leads." };
  }
  revalidatePath("/dashboard", "layout");
  return data.length !== ids.length ? { error: "One or more selected leads are no longer available. Only accessible leads were updated." }
    : { error: "", success: ids.length === 1 ? "Lead updated." : `${ids.length} leads updated.` };
}

export async function saveLeadNote(_previous: { error: string; success?: string }, formData: FormData) {
  const parsed = z.object({
    lead: z.uuid(), site: z.uuid(), note: z.uuid().nullable(),
    intent: z.enum(["add", "edit", "delete"]),
  }).safeParse({ lead: formData.get("lead"), site: formData.get("site"), note: formData.get("note"), intent: formData.get("intent") });
  if (!parsed.success) return { error: "Invalid note action." };
  const { lead, site, note, intent } = parsed.data;
  const body = z.string().trim().min(1).max(4000).safeParse(formData.get("body"));
  if (intent !== "delete" && !body.success) return { error: "Enter a note of 1 to 4,000 characters." };
  if (intent !== "add" && !note) return { error: "Choose a note to change." };
  const { supabase } = await requireUser();
  const table = supabase.from("lead_notes");
  const query = intent === "add" && body.success
    ? table.insert({ lead_id: lead, site_id: site, body: body.data })
    : (intent === "delete" ? table.delete() : table.update({ body: body.data }))
      .eq("lead_id", lead).eq("site_id", site).eq("id", note);
  const { data, error } = await query.select("id");
  if (error || !data?.length) {
    console.error("Could not save lead note", { code: error?.code ?? "not_accessible" });
    return { error: "Could not save this note. You can only change your own notes." };
  }
  revalidatePath("/dashboard/forms");
  return { error: "", success: intent === "delete" ? "Note deleted." : "Note saved." };
}
