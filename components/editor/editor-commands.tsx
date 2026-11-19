"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGetPuck } from "@puckeditor/core";
import { listPageVersions } from "@/app/editor/[pageId]/actions";
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
  const { pageId } = useInteractions();
  const ref = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listPageVersions>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    ref.current?.showModal(); setLoading(true); setError(null);
    try { setVersions(await listPageVersions(pageId)); }
    catch (cause) { console.error("Unable to load version history", cause); setError("Could not load versions. Check that the version-history migration has been applied, then retry."); }
    finally { setLoading(false); }
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
      <button type="button" onClick={() => ref.current?.close()} className="text-xs underline">Close</button>
    </dialog>
  </>;
}
