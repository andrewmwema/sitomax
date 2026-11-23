"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { undoAgentChanges } from "@/app/editor/[pageId]/agent-actions";
import { skipReason, type AgentUndoResult, type AppliedAgentChanges } from "@/lib/ai/agent-apply-types";
import type { AgentEditorBridge } from "./ai-agent-context";

export type AgentApplyReport = { dropped: { id: string; label: string; reason: string }[]; notes: string[] };

function plural(count: number) {
  return `${count} ${count === 1 ? "change" : "changes"}`;
}

/** "Undone N changes · Skipped M (edited since)", as agreed for the undo result. */
export function undoSummary(result: AgentUndoResult) {
  return `Undone ${plural(result.undone)}${result.skipped ? ` · Skipped ${result.skipped} (edited since)` : ""}`;
}

/** The confirmation shown once drafts were written: "16 changes applied", or the undo result. */
export function applyToast(applied: AppliedAgentChanges) {
  const undo = applied.undo_result;
  return undo ? `${plural(undo.undone)} undone${undo.skipped ? ` · ${undo.skipped} skipped` : ""}`
    : `${plural(applied.change_count)} applied`;
}

function itemHref(siteId: string, item: AgentUndoResult["skipped_items"][number]) {
  if (!item.target_id) return null;
  return item.kind.startsWith("page") ? `/editor/${item.target_id}` : `/dashboard/sites/${siteId}/blog/${item.target_id}`;
}

export function SkippedItems({ result, siteId }: { result: AgentUndoResult; siteId: string }) {
  if (!result.skipped_items.length) return null;
  return <ul className="mt-2 space-y-1 text-[11px] text-zinc-600" aria-label="Items that could not be undone">
    {result.skipped_items.map((item) => {
      const href = itemHref(siteId, item);
      return <li key={item.key}>
        {href ? <a href={href} className="font-medium text-violet-700 underline">{item.label}</a>
          : <span className="font-medium">{item.label}</span>}
        {" "}({skipReason(item.reason)})
      </li>;
    })}
  </ul>;
}

/**
 * Site-wide undo of one apply. Unsaved edits are saved first, so a page being
 * edited counts as changed and is skipped rather than overwritten.
 */
export async function undoAgentApply(editor: AgentEditorBridge, input: { siteId: string; applyId: string; pageId: string }): Promise<
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "success"; applied: AppliedAgentChanges; left: boolean }
> {
  if (!window.confirm("Undo these AI changes across the whole site? Anything edited or published since is kept and listed.")) {
    return { status: "cancelled" };
  }
  try {
    if (!await editor.saveDraft()) {
      return { status: "error", message: "Your draft could not be saved, so nothing was undone. Check the editor status and try again." };
    }
    const result = await undoAgentChanges(input);
    if (result.status === "error") return result;
    const left = result.editor?.deleted === true;
    if (!left && !await editor.adopt(result.editor)) {
      return { status: "error", message: "The changes were undone. Reload the editor to continue editing." };
    }
    return { status: "success", applied: result.applied, left };
  } catch (cause) {
    console.error("Could not undo AI changes", { type: cause instanceof Error ? cause.name : "Unknown" });
    return { status: "error", message: "Could not confirm that the AI changes were undone. Reload the editor before trying again." };
  }
}

/** The changeset after it was written to drafts: what happened, and the site-wide undo. */
export function AgentAppliedCard({ applied, report, siteId, undoing, disabled, onUndo }: {
  applied: AppliedAgentChanges | null; report: AgentApplyReport | null; siteId: string;
  undoing: boolean; disabled: boolean; onUndo: () => void;
}) {
  return <section className="rounded-xl border border-green-200 bg-white shadow-sm" aria-label="Applied AI changes">
    {applied ? <header className="border-b border-green-100 bg-green-50 px-3 py-3">
      <div className="flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-green-700" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-green-950">AI: {applied.summary}</h3>
          <p className="mt-1 text-[10px] text-green-900">
            Applied {plural(applied.change_count)} to drafts · {applied.applied_by_name} ·{" "}
            <time dateTime={applied.applied_at}>{new Date(applied.applied_at).toLocaleString()}</time>
          </p>
          <p className="mt-1 text-[10px] text-green-900">Nothing is live until you publish.</p>
        </div>
      </div>
    </header> : null}
    <div className="space-y-3 p-3">
      {report?.dropped.length ? <div role="status">
        <p className="text-[11px] font-semibold text-amber-800">Not applied ({report.dropped.length})</p>
        <ul className="mt-1 space-y-1 text-[11px] text-zinc-600">
          {report.dropped.map((change) => <li key={change.id}><span className="font-medium">{change.label}</span>: {change.reason}</li>)}
        </ul>
      </div> : null}
      {report?.notes.map((note) => <p key={note} role="status" className="text-[11px] text-amber-800">{note}</p>)}
      {applied?.undo_result ? <div role="status">
        <p className="text-[11px] font-semibold text-zinc-800">{undoSummary(applied.undo_result)}</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {applied.undone_by_name}{applied.undone_at ? <> · <time dateTime={applied.undone_at}>{new Date(applied.undone_at).toLocaleString()}</time></> : null}
        </p>
        <SkippedItems result={applied.undo_result} siteId={siteId} />
      </div> : applied?.can_undo ? <button type="button" disabled={disabled} onClick={onUndo}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
        <RotateCcw size={12} />{undoing ? "Undoing..." : "Undo these changes"}</button>
        : applied ? <p className="text-[11px] text-zinc-500">
          Undo is no longer available: it lasts 30 days, or until the changes are published. To go back after publishing, use Restore to draft on a published version in History.
        </p> : null}
    </div>
  </section>;
}
