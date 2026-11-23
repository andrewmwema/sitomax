"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGetPuck } from "@puckeditor/core";
import { listPageVersions } from "@/app/editor/[pageId]/actions";
import { listAgentChanges } from "@/app/editor/[pageId]/agent-actions";
import type { AppliedAgentChanges } from "@/lib/ai/agent-apply-types";
import { SkippedItems, undoAgentApply, undoSummary } from "./agent-applied-card";
import { useOptionalAiAgentPanel } from "./ai-agent-context";
import { Command, History } from "lucide-react";
import { useSectionLibrary } from "./section-library";
import { useInteractions } from "./interaction-context";
import type { useDraftPersistence } from "./use-draft-persistence";

type Persistence = ReturnType<typeof useDraftPersistence>;
export function EditorCommands({ persistence, onPublish, onTheme }: {
  persistence: Persistence; onPublish: () => void; onTheme: () => void;
}) {
  const ui = useInteractions();
  const { openLibrary } = useSectionLibrary();
  const getPuck = useGetPuck();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  const commands = [
    { label: "Add pricing section", run: () => {
      openLibrary(getPuck().appState.data.content.length, "Pricing");
    } },
    { label: "Change theme color", run: onTheme },
    { label: "Publish", run: onPublish },
    ...ui.pages.filter((page) => page.id !== ui.pageId).map((page) => ({
      label: `Go to ${page.title || page.slug || "Home"} page`,
      run: async () => { if (!persistence.dirty || await persistence.save()) router.push(`/editor/${page.id}`); },
    })),
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button type="button" onClick={() => { setQuery(""); ref.current?.showModal(); }} className="platform-button"><Command size={14} />Commands</button>
    <dialog ref={ref} aria-label="Command palette" className="editor-modal m-auto w-[min(520px,94vw)] rounded-xl border border-zinc-200 p-4 shadow-xl backdrop:bg-zinc-950/30">
      <label className="block text-xs font-semibold">Commands
        <input aria-label="Search commands" autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); ref.current?.querySelector<HTMLButtonElement>("[data-command]")?.focus(); }
            if (event.key === "Enter" && commands[0]) { event.preventDefault(); ref.current?.close(); void commands[0].run(); }
          }} className="my-3 w-full rounded-lg border p-3 text-sm font-normal" placeholder="Type a command..." />
      </label>
      <div className="flex max-h-80 flex-col overflow-y-auto" onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        event.preventDefault();
      }}>
        {commands.map((command) => <button key={command.label} data-command type="button" className="rounded-lg p-3 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100"
          onClick={() => { ref.current?.close(); void command.run(); }}>{command.label}</button>)}
        {!commands.length ? <p className="p-3 text-sm text-zinc-500">No matching commands.</p> : null}
      </div>
      <button type="button" onClick={() => ref.current?.close()} className="mt-3 text-xs text-zinc-500">Close (Esc)</button>
    </dialog>
  </>;
}

export function VersionHistory({ persistence, siteId }: { persistence: Persistence; siteId: string }) {
  const { pageId, pages } = useInteractions();
  const agent = useOptionalAiAgentPanel();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listPageVersions>>>([]);
  const [aiChanges, setAiChanges] = useState<AppliedAgentChanges[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const load = async () => {
    ref.current?.showModal(); setLoading(true); setError(null); setAiError(null);
    try { setVersions(await listPageVersions(pageId)); }
    catch (cause) { console.error("Unable to load version history", cause); setError("Could not load versions. Check that the version-history migration has been applied, then retry."); }
    try { setAiChanges(await listAgentChanges(siteId)); }
    catch (cause) {
      console.error("Unable to load AI changes", { type: cause instanceof Error ? cause.name : "Unknown" });
      setAiError("Could not load AI changes. Check that the latest database update has been applied, then retry.");
    }
    setLoading(false);
  };
  const undo = async (change: AppliedAgentChanges) => {
    if (!agent || undoing) return;
    setUndoing(change.id); setAiError(null);
    try {
      const result = await undoAgentApply(agent.editor, { siteId, applyId: change.id, pageId });
      if (result.status === "error") setAiError(result.message);
      else if (result.status === "success") {
        setAiChanges((previous) => previous.map((entry) => entry.id === change.id ? result.applied : entry));
        if (result.left) {
          const home = pages.find((page) => page.slug === "" && page.id !== pageId);
          router.push(home ? `/editor/${home.id}` : "/dashboard");
        }
      }
    } finally { setUndoing(null); }
  };
  return <>
    <button type="button" onClick={() => void load()} className="platform-button"><History size={14} />History</button>
    <dialog ref={ref} aria-label="Version history" className="editor-modal m-auto w-[min(480px,94vw)] rounded-xl border border-zinc-200 p-5 shadow-xl backdrop:bg-zinc-950/30">
      <h2 className="text-sm font-semibold">Version history</h2>
      <p className="my-2 text-xs text-zinc-500">The last 20 published versions, AI edits and header changes. Restore updates the draft, including the site-wide header, not the live site.</p>
      <Link href={`/dashboard/sites/${siteId}#ai-history`} className="my-2 block text-xs underline">Site-wide AI draft backups (account owners)</Link>
      {loading ? <p role="status">Loading...</p> : null}
      {error ? <p role="alert" className="text-xs text-red-600">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p> : null}
      <ol className="my-3 max-h-80 overflow-y-auto">
        {versions.map((version) => <li key={version.id} className="flex items-center justify-between gap-3 border-t py-3 text-xs">
          <span>{{ ai_edit: "AI edit", published: "Published", header_edit: "Header edit", header_migration: "Before global header migration" }[version.kind]} · <time dateTime={version.published_at}>{new Date(version.published_at).toLocaleString()}</time></span>
          <button type="button" disabled={persistence.busy !== null} className="rounded border px-3 py-1 disabled:opacity-40"
            onClick={async () => {
              if (!window.confirm("Restore this version to the draft? Unsaved changes will be replaced; Undo can recover them.")) return;
              if (await persistence.restore(version.id)) ref.current?.close();
            }}>Restore to draft</button>
        </li>)}
      </ol>
      {!loading && !error && !versions.length ? <p className="text-xs text-zinc-500">No versions yet.</p> : null}
      <h3 className="mt-4 text-xs font-semibold">AI changes across the site</h3>
      <p className="my-1 text-xs text-zinc-500">Undo reverses one set of AI changes on every page, the theme and the header at once. It is available for 30 days, or until the changes are published.</p>
      {aiError ? <p role="alert" className="text-xs text-red-600">{aiError}</p> : null}
      <ol className="my-2 max-h-64 overflow-y-auto">
        {aiChanges.map((change) => <li key={change.id} className="border-t py-3 text-xs">
          <p className="font-medium">AI: {change.summary}</p>
          <p className="mt-0.5 text-zinc-500">Applied by {change.applied_by_name} · <time dateTime={change.applied_at}>{new Date(change.applied_at).toLocaleString()}</time></p>
          {change.undo_result ? <>
            <p className="mt-1">{undoSummary(change.undo_result)}</p>
            <p className="mt-0.5 text-zinc-500">Undone by {change.undone_by_name}{change.undone_at ? <> · <time dateTime={change.undone_at}>{new Date(change.undone_at).toLocaleString()}</time></> : null}</p>
            <SkippedItems result={change.undo_result} siteId={siteId} />
          </> : change.can_undo && agent ? <button type="button" disabled={undoing !== null || persistence.busy !== null}
            className="mt-2 rounded border px-3 py-1 disabled:opacity-40" onClick={() => void undo(change)}>
            {undoing === change.id ? "Undoing..." : `Undo AI: ${change.summary}`}</button>
            : <p className="mt-1 text-zinc-500">Undo is no longer available.</p>}
        </li>)}
      </ol>
      {!loading && !aiError && !aiChanges.length ? <p className="text-xs text-zinc-500">No AI changes yet.</p> : null}
      <button type="button" onClick={() => ref.current?.close()} className="text-xs underline">Close</button>
    </dialog>
  </>;
}
