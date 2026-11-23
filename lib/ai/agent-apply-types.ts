import { z } from "zod";
import type { SiteTheme } from "@/lib/theme/presets";

/** Shapes shared by the apply/undo server actions and the editor UI. */
export const undoResultSchema = z.object({
  undone: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  undone_items: z.array(z.string()),
  skipped_items: z.array(z.object({
    key: z.string(), kind: z.string(), target_id: z.uuid().nullable(), label: z.string(),
    reason: z.enum(["edited", "published", "restricted"]),
  })),
});
export type AgentUndoResult = z.infer<typeof undoResultSchema>;

export const appliedChangesSchema = z.object({
  id: z.uuid(), run_id: z.uuid().nullable(), summary: z.string(), change_count: z.number().int(),
  applied_by_name: z.string(), applied_at: z.string(),
  undone_by_name: z.string().nullable(), undone_at: z.string().nullable(),
  undo_result: undoResultSchema.nullable(), can_undo: z.boolean(),
});
export type AppliedAgentChanges = z.infer<typeof appliedChangesSchema>;

/** The open page as the editor should now show it, after drafts changed on the server. */
export type AgentEditorState =
  | { deleted: true }
  | { deleted?: false; data: Record<string, unknown>; version: string; theme: SiteTheme; draftHeader: unknown };

export type AgentApplyResult =
  | { status: "error"; message: string; dropped?: { id: string; label: string; reason: string }[] }
  | {
    status: "success"; applied: AppliedAgentChanges;
    dropped: { id: string; label: string; reason: string }[]; notes: string[]; editor: AgentEditorState | null;
  };
export type AgentUndoOutcome =
  | { status: "error"; message: string }
  | { status: "success"; applied: AppliedAgentChanges; editor: AgentEditorState | null };

const SKIP_REASONS: Record<AgentUndoResult["skipped_items"][number]["reason"], string> = {
  edited: "edited since",
  published: "already published; restore a published version from History instead",
  restricted: "contains embed code only your agency can restore",
};
export function skipReason(reason: keyof typeof SKIP_REASONS) {
  return SKIP_REASONS[reason];
}
