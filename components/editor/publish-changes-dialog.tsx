"use client";

import { useState } from "react";
import { ArrowUpRight, Check, X } from "lucide-react";
import {
  defaultPublishScope,
  initialPublishSelection,
  type PublishSelection,
} from "@/lib/publishing";

export type PublishDialogPage = {
  id: string;
  slug: string;
  title: string | null;
  published: boolean;
  hasChanges: boolean;
  footerChanged: boolean;
};

export type PublishDialogState = {
  pages: PublishDialogPage[];
  headerChanged: boolean;
  themeChanged: boolean;
  blogSettingsChanged: boolean;
  liveUrl: string;
};

export type PublishResult = { status: "success"; message: string; liveUrl: string } | { status: "error"; message: string };

export function PublishChangesDialog({
  state,
  currentPageId,
  onClose,
  onPublish,
}: {
  state: PublishDialogState;
  currentPageId: string;
  onClose: () => void;
  onPublish: (selection: PublishSelection) => Promise<PublishResult>;
}) {
  const defaultScope = defaultPublishScope(state, currentPageId);
  const [scope, setScope] = useState<"page" | "site">(defaultScope);
  const [selection, setSelection] = useState(() => initialPublishSelection(state, currentPageId, defaultScope));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");

  function chooseScope(next: "page" | "site") {
    setScope(next);
    setSelection(initialPublishSelection(state, currentPageId, next));
  }

  function togglePage(pageId: string, checked: boolean) {
    setSelection((current) => ({
      ...current,
      pageIds: checked
        ? [...current.pageIds, pageId]
        : current.pageIds.filter((id) => id !== pageId),
    }));
  }

  const hasSelection = selection.pageIds.length > 0 || selection.publishHeader ||
    selection.publishTheme || selection.publishBlogSettings;
  const pending = state.pages.filter((page) => page.hasChanges);

  async function publish() {
    setWorking(true);
    setError("");
    try {
      const result = await onPublish(selection);
      if (result.status === "error") setError(result.message);
      else setPublishedUrl(result.liveUrl);
    } catch (cause) {
      console.error("Could not publish site changes", cause);
      setError("Could not publish changes. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title"
      className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 id="publish-dialog-title" className="text-base font-semibold text-zinc-900">
            {publishedUrl ? "Your site is live" : "Publish changes"}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Choose what to make public. Footer changes are included with their page.</p>
        </div>
        <button type="button" aria-label="Close publish dialog" className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
          onClick={onClose}><X size={18} /></button>
      </header>

      {publishedUrl ? <div role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-900"><Check size={16} />Live at {publishedUrl}</p>
        <a href={publishedUrl} target="_blank" rel="noreferrer" className="platform-button platform-button-primary mt-3">
          <ArrowUpRight size={14} />View live
        </a>
      </div> : <>
        <fieldset className="mt-5 flex gap-2">
          <legend className="sr-only">Publish scope</legend>
          <button type="button" aria-pressed={scope === "page"} disabled={working}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${scope === "page" ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-zinc-200"}`}
            onClick={() => chooseScope("page")}>Publish this page</button>
          <button type="button" aria-pressed={scope === "site"} disabled={working}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${scope === "site" ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-zinc-200"}`}
            onClick={() => chooseScope("site")}>Publish entire site</button>
        </fieldset>
        <p className="mt-2 text-[11px] text-zinc-500">Choose a preset, then adjust the checked items below.</p>

        <fieldset className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-3">
          <legend className="px-1 text-xs font-semibold text-zinc-700">Unpublished changes</legend>
          {pending.map((page) => <label key={page.id} className="flex items-start gap-2 rounded px-1 py-2 text-sm hover:bg-zinc-50">
            <input type="checkbox" className="mt-0.5" checked={selection.pageIds.includes(page.id)} disabled={working}
              onChange={(event) => togglePage(page.id, event.target.checked)} />
            <span className="min-w-0">
              <span className="block font-medium text-zinc-800">
                {page.title?.trim() || (page.slug ? page.slug.replaceAll("/", " / ") : "Home")}
                {!page.published ? " · Draft" : ""}
              </span>
              {page.footerChanged ? <span className="block text-xs text-zinc-500">Includes unpublished footer changes</span> : null}
            </span>
          </label>)}
          {state.headerChanged ? <label className="flex items-center gap-2 rounded px-1 py-2 text-sm hover:bg-zinc-50">
            <input type="checkbox" checked={selection.publishHeader} disabled={working}
              onChange={(event) => setSelection((current) => ({ ...current, publishHeader: event.target.checked }))} />
            Header
          </label> : null}
          {state.themeChanged ? <label className="flex items-center gap-2 rounded px-1 py-2 text-sm hover:bg-zinc-50">
            <input type="checkbox" checked={selection.publishTheme} disabled={working}
              onChange={(event) => setSelection((current) => ({ ...current, publishTheme: event.target.checked }))} />
            Theme
          </label> : null}
          {state.blogSettingsChanged ? <label className="flex items-center gap-2 rounded px-1 py-2 text-sm hover:bg-zinc-50">
            <input type="checkbox" checked={selection.publishBlogSettings} disabled={working}
              onChange={(event) => setSelection((current) => ({ ...current, publishBlogSettings: event.target.checked }))} />
            Blog settings
          </label> : null}
          {!pending.length && !state.headerChanged && !state.themeChanged && !state.blogSettingsChanged
            ? <p className="py-2 text-sm text-zinc-500">No unpublished changes found.</p> : null}
        </fieldset>
        {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
        <footer className="mt-5 flex justify-end gap-2">
          <button type="button" className="platform-button" disabled={working} onClick={onClose}>Cancel</button>
          <button type="button" className="platform-button platform-button-primary" disabled={working || !hasSelection}
            onClick={() => void publish()}>{working ? "Publishing…" : "Publish selected changes"}</button>
        </footer>
      </>}
    </section>
  </div>;
}
