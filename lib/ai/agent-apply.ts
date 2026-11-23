import "server-only";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { EDITOR_DRAFT_SOURCE, editorDraft } from "@/lib/editor/initial-data";
import { headerSchema } from "@/lib/header";
import { sanitizePuckData } from "@/lib/richtext";
import { themeSchema } from "@/lib/theme/schema";
import { loadAgentSiteState } from "./agent";
import { planAgentApply, type ApplyItem, type ApplyMeta, type ApplyPlan } from "./agent-apply-plan";
import {
  appliedChangesSchema, undoResultSchema,
  type AgentApplyResult, type AgentEditorState, type AgentUndoOutcome, type AppliedAgentChanges,
} from "./agent-apply-types";
import { createAgentReviewPayload } from "./agent-review";

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

const applyInputSchema = z.strictObject({
  siteId: z.uuid(), threadId: z.uuid(), runId: z.uuid(), pageId: z.uuid(),
  undone: z.array(z.string().min(1).max(100)).max(200),
});
const undoInputSchema = z.strictObject({ siteId: z.uuid(), applyId: z.uuid(), pageId: z.uuid() });
const pageFactsSchema = z.array(z.object({
  id: z.uuid(), draft_version: z.uuid(), published_at: z.string().nullable(), draft_data: z.unknown(),
}));
const postFactsSchema = z.array(z.object({ id: z.uuid(), updated_at: z.string() }));
const draftSchema = z.looseObject({ content: z.array(z.looseObject({ type: z.string() })) });

const MIGRATION_MISSING = "AI changes cannot be applied yet. Ask your agency to apply the latest database update.";

function applyError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "40001": return "Your drafts changed while the AI changes were being applied. Nothing was changed; try again.";
    case "23505": return "A page or post with the same address already exists. Nothing was changed.";
    case "42501": return /embed/i.test(error.message ?? "")
      ? "Only your agency can add or change embed code. Nothing was changed."
      : "You do not have access to apply these changes.";
    case "P0001": return error.message ?? "These AI changes are unavailable.";
    case "PGRST202": case "42883": return MIGRATION_MISSING;
    default: return "Could not apply the AI changes. Nothing was changed.";
  }
}

export async function listAgentApplies(supabase: Supabase, siteId: string): Promise<AppliedAgentChanges[]> {
  const { data, error } = await supabase.rpc("list_ai_agent_applies", { p_site_id: siteId });
  if (error) throw new Error("Could not load AI changes.", { cause: error });
  return z.array(appliedChangesSchema).parse(data ?? []);
}

async function findApply(supabase: Supabase, siteId: string, applyId: string) {
  const { data, error } = await supabase.rpc("list_ai_agent_applies", { p_site_id: siteId, p_apply_id: applyId });
  if (error) throw new Error("Could not load the applied AI changes.", { cause: error });
  return z.array(appliedChangesSchema).length(1).parse(data)[0];
}

/** The open page as stored now, for the editor to adopt without a reload. */
async function loadEditorState(supabase: Supabase, pageId: string): Promise<AgentEditorState> {
  const { data, error } = await supabase.from("pages")
    .select(`${EDITOR_DRAFT_SOURCE.page}, site:sites(${EDITOR_DRAFT_SOURCE.site})`).eq("id", pageId).maybeSingle();
  if (error) throw new Error("Could not load the updated page.", { cause: error });
  if (!data) return { deleted: true };
  const site = z.object({ theme: z.unknown(), draft_theme: z.unknown(), draft_header: z.unknown() }).parse(data.site);
  // The same read as opening the editor, so what is adopted is what a reload would show.
  const draft = editorDraft({ ...data, draft_version: z.uuid().parse(data.draft_version) }, site);
  return { ...draft, theme: themeSchema.parse(draft.theme ?? {}) };
}

/** Checks planned writes against the schemas the editor reads them with. */
export function validateApplyItems(items: ApplyItem[]): ApplyItem[] {
  return items.map((item) => {
    if (item.kind === "theme") return { ...item, after: themeSchema.parse(item.after) };
    if (item.kind === "header") return { ...item, after: headerSchema.parse(item.after) };
    if (item.kind === "page" || item.kind === "page_created") {
      // Agent text is sanitized when staged; repeat it at the write boundary.
      return { ...item, draft_data: sanitizePuckData(draftSchema.parse(item.draft_data)) };
    }
    return item;
  });
}

/**
 * Applies the kept changes of a finished agent run to drafts. Changes are
 * rebased on the current drafts first, so manual edits made since the run are
 * kept and the conflicting changes are reported instead.
 */
export async function applyAgentRun(raw: unknown): Promise<AgentApplyResult> {
  const input = applyInputSchema.safeParse(raw);
  if (!input.success) return { status: "error", message: "Invalid AI changes." };
  const { siteId, threadId, runId, pageId, undone } = input.data;
  const { supabase } = await requireUser();

  const [thread, run] = await Promise.all([
    supabase.from("ai_agent_threads").select("site_id, title").eq("id", threadId).maybeSingle(),
    supabase.from("ai_agent_runs").select("status, changeset").eq("id", runId).eq("thread_id", threadId).maybeSingle(),
  ]);
  if (thread.error || run.error) {
    console.error("Could not load AI changes to apply", { code: thread.error?.code ?? run.error?.code });
    return { status: "error", message: "Could not load these AI changes." };
  }
  const owner = z.object({ site_id: z.uuid(), title: z.string() }).safeParse(thread.data);
  const finished = z.object({ status: z.enum(["completed", "stopped", "failed"]), changeset: z.unknown() }).safeParse(run.data);
  if (!owner.success || !finished.success || owner.data.site_id !== siteId) {
    return { status: "error", message: "These AI changes are unavailable." };
  }
  const review = createAgentReviewPayload(finished.data.changeset);
  if (!review?.changes.length) return { status: "error", message: "There are no AI changes to apply." };

  let plan: ApplyPlan;
  try {
    const { snapshot, rows } = await loadAgentSiteState(supabase, siteId);
    const meta: ApplyMeta = {
      draftHeader: snapshot.site.draft_header,
      pages: Object.fromEntries(pageFactsSchema.parse(rows.pages).map((page) =>
        [page.id, { draftVersion: page.draft_version, published: page.published_at !== null, rawDraft: page.draft_data }])),
      posts: Object.fromEntries(postFactsSchema.parse(rows.posts).map((post) => [post.id, { updatedAt: post.updated_at }])),
    };
    plan = planAgentApply(snapshot, meta, review.changes, new Set(undone));
    plan.items = validateApplyItems(plan.items);
  } catch (cause) {
    console.error("Could not prepare AI changes", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error", message: "Could not prepare these AI changes. Nothing was changed." };
  }
  if (!plan.items.length) {
    return {
      status: "error", dropped: plan.dropped,
      message: plan.dropped.length ? "None of the kept changes could be applied. Nothing was changed." : "There are no AI changes to apply.",
    };
  }

  const { data: applyId, error } = await supabase.rpc("apply_ai_agent_changes", {
    p_run_id: runId, p_summary: owner.data.title.trim().slice(0, 200) || "AI changes",
    p_changes: plan.changes, p_items: plan.items,
  });
  if (error) {
    console.error("Could not apply AI changes", { code: error.code });
    return { status: "error", message: applyError(error) };
  }
  try {
    const touched = plan.items.some((item) => item.key === `page:${pageId}` || item.kind === "theme" || item.kind === "header");
    const [applied, editor] = await Promise.all([
      findApply(supabase, siteId, z.uuid().parse(applyId)),
      touched ? loadEditorState(supabase, pageId) : null,
    ]);
    return { status: "success", applied, dropped: plan.dropped, notes: plan.notes, editor };
  } catch (cause) {
    console.error("AI changes were applied but could not be reloaded", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error", message: "The AI changes were applied. Reload the editor to see them." };
  }
}

/** Site-wide undo of one apply; available to any member who can edit the site. */
export async function undoAgentApply(raw: unknown): Promise<AgentUndoOutcome> {
  const input = undoInputSchema.safeParse(raw);
  if (!input.success) return { status: "error", message: "Invalid AI changes." };
  const { siteId, applyId, pageId } = input.data;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("undo_ai_agent_apply", { p_apply_id: applyId });
  if (error) {
    console.error("Could not undo AI changes", { code: error.code });
    return { status: "error", message: error.code === "P0001" && error.message ? error.message
      : error.code === "42501" ? "These AI changes are unavailable."
        : error.code === "PGRST202" || error.code === "42883" ? MIGRATION_MISSING
          : "Could not undo the AI changes. Nothing was changed." };
  }
  try {
    const result = undoResultSchema.parse(data);
    const touched = result.undone_items.some((key) => key === `page:${pageId}` || key === "theme" || key === "header");
    const [applied, editor] = await Promise.all([
      findApply(supabase, siteId, applyId),
      touched ? loadEditorState(supabase, pageId) : null,
    ]);
    return { status: "success", applied, editor };
  } catch (cause) {
    console.error("AI changes were undone but could not be reloaded", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error", message: "The AI changes were undone. Reload the editor to see the result." };
  }
}
