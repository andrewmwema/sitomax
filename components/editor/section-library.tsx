"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useGetPuck, type Data } from "@puckeditor/core";
import { Grid2X2, List, Search, Sparkles, X, ZoomIn } from "lucide-react";
import type { SiteTheme } from "@/lib/theme/presets";
import {
  SECTION_CATEGORIES, designsForCategory, sectionCatalog, searchSectionDesigns,
  type SectionCategory, type SectionDesign,
} from "@/lib/sections/catalog";
import { listSavedDesigns, setDesignGlobal } from "@/lib/sections/actions";
import { buildDesignItem } from "@/lib/sections/library";
import { DesignThumbnail } from "./design-thumbnail";
import { useOptionalAiAgentPanel } from "./ai-agent-context";
import { ROW_LAYOUTS, ROW_LAYOUT_IDS, blankSection } from "@/lib/layout/structure";

export const ROOT_ZONE = "root:default-zone";

export type SectionLibraryUi = {
  isSuperAdmin: boolean;
  theme: SiteTheme;
  library: { open: boolean; index: number; category?: SectionCategory };
  openLibrary: (index: number, category?: SectionCategory) => void;
  closeLibrary: () => void;
  preview: SectionDesign | null;
  setPreview: (design: SectionDesign | null) => void;
  saveDialogOpen: boolean;
  openSaveDesign: () => void;
  closeSaveDesign: () => void;
};

export const SectionLibraryContext = createContext<SectionLibraryUi | null>(null);

export function useSectionLibrary(): SectionLibraryUi {
  const context = useContext(SectionLibraryContext);
  if (!context) throw new Error("SectionLibraryContext missing");
  return context;
}

export function SectionLibraryPanel() {
  const { library } = useSectionLibrary();
  return library.open ? <LibraryContent /> : null;
}

function LibraryContent() {
  const { library, closeLibrary, theme, setPreview, isSuperAdmin } = useSectionLibrary();
  const getPuck = useGetPuck();
  const agent = useOptionalAiAgentPanel();
  const panelRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"designed" | "saved">("designed");
  const [category, setCategory] = useState<SectionCategory>(library.category ?? "Hero");
  const [savedDesigns, setSavedDesigns] = useState<SectionDesign[] | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [zoom, setZoom] = useState<SectionDesign | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listSavedDesigns().then((designs) => {
      if (!cancelled) setSavedDesigns(designs);
    }).catch((cause: unknown) => {
      console.error("Unable to load saved section designs", cause);
      if (!cancelled) setError("Saved designs could not be loaded. Please retry.");
    });
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const frameDoc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
    const canvasFocus = frameDoc?.activeElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (panelRef.current?.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeLibrary();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    frameDoc?.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      frameDoc?.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      if (canvasFocus && "focus" in canvasFocus) (canvasFocus as HTMLElement).focus();
    };
  }, [closeLibrary]);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-editor-header-actions]");
    if (!header) return;
    const measure = () => {
      const bottom = (header.closest("header") ?? header).getBoundingClientRect().bottom;
      panelRef.current?.style.setProperty("--library-top", `${bottom + 8}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const allDesigns = useMemo(() => [...sectionCatalog, ...(savedDesigns ?? [])], [savedDesigns]);
  const source = tab === "saved"
    ? (savedDesigns ?? []).filter((design) => design.saved?.isOwner)
    : allDesigns;
  const searching = query.trim().length > 0;
  const blank = category === "Blank" && !searching;
  const designs = searching ? searchSectionDesigns(source, query) : designsForCategory(source, category);

  const insertItem = useCallback((item: { type: string; props: Record<string, unknown> }) => {
    const { dispatch, appState } = getPuck();
    const index = Math.min(library.index, appState.data.content.length);
    setPreview(null);
    dispatch({
      type: "setData",
      recordHistory: true,
      data: (previous: Data) => ({
        ...previous,
        content: [...previous.content.slice(0, index), item, ...previous.content.slice(index)],
      }),
    });
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    closeLibrary();
  }, [getPuck, library.index, closeLibrary, setPreview]);

  const share = async (design: SectionDesign) => {
    if (!design.saved) return;
    setSharing(design.id);
    setError(null);
    try {
      const isGlobal = !design.saved.isGlobal;
      const result = await setDesignGlobal({ id: design.saved.id, isGlobal });
      if (result.status === "error") setError(result.message);
      else setSavedDesigns((previous) => previous?.map((entry) =>
        entry.id === design.id && entry.saved
          ? { ...entry, saved: { ...entry.saved, isGlobal } } : entry) ?? null);
    } catch (cause) {
      console.error("Unable to update design visibility", cause);
      setError("Could not update design visibility. Please retry.");
    } finally { setSharing(null); }
  };

  const clearPreview = () => setPreview(null);
  return (
    <aside ref={panelRef} tabIndex={-1} aria-label="Section library" className="section-library-panel editor-library">
      <header className="flex items-center justify-between border-b border-[#E8E7E3] px-5 py-5">
        <div>
          <p className="platform-eyebrow mb-1">Build beautifully</p>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900">Section library</h2>
          <p className="mt-1 text-xs text-zinc-500">Insert at position {library.index + 1} · Hover to try it</p>
        </div>
        <div className="flex items-center gap-2">
          {agent ? <button type="button" className="platform-button platform-button-ai" onClick={() => {
            const insertAt = Math.min(library.index, getPuck().appState.data.content.length);
            setPreview(null);
            closeLibrary();
            agent.openWith({ prompt: "Add a section here: ", insertAt });
          }}><Sparkles size={13} />Ask AI</button> : null}
          <button type="button" onClick={closeLibrary} aria-label="Close section library" className="rounded-lg p-2 hover:bg-zinc-100"><X size={18} /></button>
        </div>
      </header>
      <div role="tablist" aria-label="Design source" className="flex gap-1 border-b border-zinc-200 px-4 pt-2">
        {(["designed", "saved"] as const).map((value) => (
          <button key={value} type="button" role="tab" id={`library-tab-${value}`}
            aria-selected={tab === value} aria-controls="library-designs"
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? (value === "designed" ? "saved" : "designed") :
                event.key === "Home" ? "designed" : event.key === "End" ? "saved" : null;
              if (next) {
                event.preventDefault(); setTab(next); clearPreview();
                panelRef.current?.querySelector<HTMLButtonElement>(`#library-tab-${next}`)?.focus();
              }
            }}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === value ? "border-[#4B3FE0] text-[#4B3FE0]" : "border-transparent text-zinc-500"}`}
            onClick={() => { setTab(value); clearPreview(); }}>
            {value === "designed" ? "Designed" : "Saved designs"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-zinc-200 p-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-300 px-2.5">
          <Search size={15} className="shrink-0 text-zinc-400" />
          <span className="sr-only">Search section designs</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); clearPreview(); }}
            placeholder="Search designs..." className="min-h-10 w-full min-w-0 text-sm outline-none" />
        </label>
        {(["grid", "list"] as const).map((value) => (
          <button key={value} type="button" aria-label={`${value === "grid" ? "Grid" : "List"} view`}
            aria-pressed={view === value} onClick={() => { setView(value); clearPreview(); }}
            className={`rounded-lg p-2 ${view === value ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"}`}>
            {value === "grid" ? <Grid2X2 size={17} /> : <List size={17} />}
          </button>
        ))}
      </div>
      {error ? (
        <div role="alert" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {error}
          <button type="button" className="underline" onClick={() => { setError(null); setReload((n) => n + 1); }}>Retry</button>
        </div>
      ) : null}
      <nav aria-label="Section categories" className="flex max-h-36 shrink-0 flex-wrap gap-1.5 overflow-y-auto border-b border-[#E8E7E3] p-3">
          {SECTION_CATEGORIES.map((entry) => (
            <button key={entry} type="button" aria-current={!searching && category === entry ? "true" : undefined}
              onClick={() => { setCategory(entry); setQuery(""); clearPreview(); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] ${!searching && category === entry ? "border-[#D9D3FF] bg-[#F1EFFF] font-medium text-[#4B3FE0]" : "border-[#E8E7E3] text-zinc-600 hover:bg-[#F7F7F5]"}`}>
              <span>{entry}</span>
              <span className="tabular-nums opacity-60">{entry === "Blank" ? ROW_LAYOUT_IDS.length : designsForCategory(source, entry).length}</span>
            </button>
          ))}
        </nav>
      <div className="flex min-h-0 flex-1">
        <div id="library-designs" role="tabpanel" aria-labelledby={`library-tab-${tab}`}
          className="editor-library-results min-w-0 flex-1 overflow-y-auto p-3" onMouseLeave={clearPreview}>
          <p role="status" className="mb-3 text-xs text-zinc-500">
            {blank ? "Start with a column layout" : `${designs.length} ${searching ? "search results" : "designs"}`}
            {savedDesigns === null && !error ? " · Loading saved designs..." : ""}
          </p>
          <div className={`grid auto-rows-max content-start gap-3 ${view === "grid" ? "grid-cols-2" : "grid-cols-1"}`}>
            {blank ? ROW_LAYOUT_IDS.map((layout) => (
              <button key={layout} type="button" onClick={() => insertItem(blankSection(layout))}
                className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-700 hover:border-zinc-500">
                <span className="mb-2 flex h-16 gap-1.5" aria-hidden="true">
                  {ROW_LAYOUTS[layout].fractions.map((fraction, index) => (
                    <span key={index} style={{ flex: fraction }} className="rounded border border-dashed border-zinc-300 bg-zinc-50" />
                  ))}
                </span>
                {ROW_LAYOUTS[layout].label}
              </button>
            )) : designs.map((design) => (
              <article key={design.id} className={`group relative overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:border-zinc-400 focus-within:ring-2 focus-within:ring-[#4B3FE0] ${view === "list" ? "flex flex-wrap" : ""}`}
                onMouseEnter={() => setPreview(design)} onMouseLeave={clearPreview}>
                <div inert aria-hidden="true" className={`pointer-events-none ${view === "list" ? "w-32 shrink-0" : "w-full"}`}>
                  <DesignThumbnail design={design} theme={theme} />
                </div>
                <div className="min-w-0 flex-1 p-2">
                  <p className="truncate text-xs font-medium text-zinc-700">{design.name}</p>
                  {design.saved ? <p className="mt-1 text-[10px] text-zinc-500">{design.saved.isGlobal ? "Global" : "Private"}</p> : null}
                </div>
                <button type="button" aria-label={`Insert ${design.name}`}
                  onFocus={() => setPreview(design)} onBlur={clearPreview}
                  onClick={() => insertItem(buildDesignItem(design))}
                  className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4B3FE0]" />
                <button type="button" aria-label={`Enlarge ${design.name}`}
                  onClick={() => { clearPreview(); setZoom(design); }}
                  className="absolute top-1 right-1 z-20 rounded-md border border-zinc-200 bg-white/95 p-1.5 text-zinc-600 shadow-sm hover:text-zinc-950">
                  <ZoomIn size={14} />
                </button>
                {isSuperAdmin && design.saved ? (
                  <button type="button" disabled={sharing !== null} onClick={() => void share(design)}
                    className="relative z-20 w-full border-t border-zinc-100 p-2 text-left text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
                    {sharing === design.id ? "Updating..." : design.saved.isGlobal ? "Make private" : "Share globally"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {!blank && designs.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              {searching ? "No designs match your search." : tab === "saved" ? "No saved designs here yet. Select a section and choose Save as design." : "No designs in this category yet."}
            </p>
          ) : null}
        </div>
      </div>
      {zoom ? <DesignZoom design={zoom} theme={theme} onClose={() => setZoom(null)}
        onInsert={() => insertItem(buildDesignItem(zoom))} /> : null}
    </aside>
  );
}

function DesignZoom({ design, theme, onClose, onInsert }: {
  design: SectionDesign; theme: SiteTheme; onClose: () => void; onInsert: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} aria-label={`Preview ${design.name}`} onCancel={onClose}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      className="m-auto max-h-[90vh] w-[min(1100px,94vw)] max-w-none overflow-hidden rounded-xl border border-zinc-200 p-0 shadow-2xl backdrop:bg-zinc-950/40">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{design.name}</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onInsert} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white">Insert section</button>
          <button type="button" onClick={onClose} aria-label="Close preview" className="p-2"><X size={18} /></button>
        </div>
      </header>
      <div className="max-h-[calc(90vh-76px)] overflow-y-auto">
        <DesignThumbnail design={design} theme={theme} expanded />
      </div>
    </dialog>
  );
}
