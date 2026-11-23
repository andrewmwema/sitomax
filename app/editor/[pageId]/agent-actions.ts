"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { applyAgentRun, listAgentApplies, undoAgentApply } from "@/lib/ai/agent-apply";
import type { AppliedAgentChanges } from "@/lib/ai/agent-apply-types";

/**
 * AI agent apply and undo. Access is enforced by the database functions these
 * call: the run's owner applies, and any member of the site can undo.
 */
export async function applyAgentChanges(raw: unknown) {
  const result = await applyAgentRun(raw);
  if (result.status === "success") revalidatePath("/editor/[pageId]", "page");
  return result;
}

export async function undoAgentChanges(raw: unknown) {
  const result = await undoAgentApply(raw);
  if (result.status === "success") revalidatePath("/editor/[pageId]", "page");
  return result;
}

export async function listAgentChanges(siteId: string): Promise<AppliedAgentChanges[]> {
  const { supabase } = await requireUser();
  return listAgentApplies(supabase, z.uuid().parse(siteId));
}
