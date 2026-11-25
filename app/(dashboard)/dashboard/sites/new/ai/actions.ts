"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildGeneratedSite, SiteGenerationError } from "@/lib/ai/generate-site";
import { AiProviderError, aiErrorMessage } from "@/lib/ai/provider-error";

export async function generateSite(raw: unknown) {
  try {
    const result = await buildGeneratedSite(raw);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/sites/${result.siteId}`);
    return { status: "success" as const, ...result };
  } catch (cause) {
    unstable_rethrow(cause);
    console.error("Site generation action failed", { type: cause instanceof Error ? cause.name : "Unknown" });
    const fallback = cause instanceof SiteGenerationError || cause instanceof AiProviderError ? cause.message
      : cause instanceof z.ZodError ? "Check the business details and replacement confirmation." : "Generation failed. Check your drafts before retrying.";
    return { status: "error" as const, message: await aiErrorMessage(cause, fallback) };
  }
}

export async function restoreAiDrafts(raw: unknown) {
  const parsed = z.object({ siteId: z.uuid(), versionId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "error" as const, message: "Invalid draft backup." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("restore_ai_draft_version", {
    p_site_id: parsed.data.siteId,
    p_version_id: parsed.data.versionId,
  });
  if (error) {
    console.error("Could not restore AI draft backup", { code: error.code });
    return { status: "error" as const, message: "Could not restore this backup. Account-owner access is required; deleted pages must be recovered by your agency." };
  }
  revalidatePath(`/dashboard/sites/${parsed.data.siteId}`);
  return { status: "success" as const };
}
