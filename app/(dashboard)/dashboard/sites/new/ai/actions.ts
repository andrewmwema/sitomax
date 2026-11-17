"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildGeneratedSite, SiteGenerationError } from "@/lib/ai/generate-site";

export async function generateSite(raw: unknown) {
  try {
    const result = await buildGeneratedSite(raw);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/sites/${result.siteId}`);
    return { status: "success" as const, ...result };
  } catch (cause) {
    unstable_rethrow(cause);
    console.error("Site generation action failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error" as const, message: cause instanceof SiteGenerationError ? cause.message
      : cause instanceof z.ZodError ? "Check the business details and replacement confirmation." : "Generation failed. Check your drafts before retrying." };
  }
}

export async function restoreAiDrafts(raw: unknown) {
  const parsed = z.object({ siteId: z.uuid(), versionId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid draft backup." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("restore_site_draft_version", { p_version_id: parsed.data.versionId });
  if (error) {
    console.error("Could not restore AI draft backup", { code: error.code });
    return { status: "error" as const, message: "Could not restore this backup. Account-owner access is required; deleted pages must be recovered by your agency." };
  }
  revalidatePath(`/dashboard/sites/${parsed.data.siteId}`);
  return { status: "success" as const };
}
