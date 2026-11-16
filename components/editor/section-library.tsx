"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGetPuck, type Data } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import {
  SECTION_CATEGORIES,
  designsForCategory,
  sectionCatalog,
  searchSectionDesigns,
  type SectionCategory,
  type SectionDesign,
} from "@/lib/sections/catalog";
import { listSavedDesigns } from "@/lib/sections/actions";
import { DesignThumbnail } from "@/components/editor/design-thumbnail";
import { BlockThumbnail } from "@/components/editor/block-thumbnail";

/** Root content zone id used by Puck for top-level sections. */
export const ROOT_ZONE = "root:default-zone";

/**
 * Shared editor UI state for the section library: the "Add section"
 * modal (opened from the canvas at a given insert position) and the
 * super-admin "Save as design" dialog.
 */
export type SectionLibraryUi = {
  isSuperAdmin: boolean;
  theme: SiteTheme;
  library: { open: boolean; index: number };
  openLibrary: (index: number) => void;
  closeLibrary: () => void;
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

/** Inserts a catalog/saved design as a new content item at `index`. */
function buildDesignItem(design: SectionDesign) {
  const defaults =
    puckConfig.components[design.blockType as keyof typeof puckConfig.components]
      ?.defaultProps ?? {};
  return {
    type: design.blockType,
    props: {
      ...defaults,
      ...design.props,
      id: `${design.blockType}-${crypto.randomUUID()}`,
    },
  };
}

/**
 * "Add section" modal. Step 1 asks Blank vs Designed; Blank lists every
 * block with its minimal defaults, Designed shows the design gallery
 * (catalog + designs saved by the agency) filtered by category.
 * Drag-and-drop from the Elements list keeps working as before.
 */
export function SectionLibraryModal() {
  const { library } = useSectionLibrary();
  // Remount on every open so navigation state resets to the first step.
  if (!library.open) return null;
  return <SectionLibraryModalContent />;
}

function SectionLibraryModalContent() {
  const { library, closeLibrary, theme } = useSectionLibrary();
  const getPuck = useGetPuck();

  const [mode, setMode] = useState<"choose" | "blank" | "designed">("choose");
  const [category, setCategory] = useState<SectionCategory>("Hero");
  const [savedDesigns, setSavedDesigns] = useState<SectionDesign[] | null>(null);
  const [query, setQuery] = useState("");
  const [savedError, setSavedError] = useState<string | null>(null);

  // Load the agency's saved designs when the gallery is first shown.
  useEffect(() => {
    if (mode !== "designed" || savedDesigns !== null) return;
    let cancelled = false;
    listSavedDesigns()
      .then((designs) => {
        if (!cancelled) setSavedDesigns(designs);
      })
      .catch((error: unknown) => {
        console.error("Unable to load saved section designs", error);
        if (!cancelled) {
          setSavedError("Saved designs could not be loaded. Built-in designs are still available.");
          setSavedDesigns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, savedDesigns]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLibrary();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLibrary]);

  // Opening from a canvas pill leaves focus inside the preview iframe,
  // where the window keydown listener above would never hear Escape.
  // Standard dialog behavior fixes it: move focus into the dialog.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const allDesigns = useMemo(
    () => [...sectionCatalog, ...(savedDesigns ?? [])],
    [savedDesigns],
  );

  const selectAfterInsert = useCallback(
    (index: number) => {
      getPuck().dispatch({
        type: "setUi",
        ui: { itemSelector: { index, zone: ROOT_ZONE } },
      });
    },
    [getPuck],
  );

  const insertBlank = useCallback(
    (componentType: string) => {
      getPuck().dispatch({
        type: "insert",
        componentType,
        destinationIndex: library.index,
        destinationZone: ROOT_ZONE,
      });
      selectAfterInsert(library.index);
      closeLibrary();
    },
    [getPuck, library.index, selectAfterInsert, closeLibrary],
  );

  const insertDesign = useCallback(
    (design: SectionDesign) => {
      const item = buildDesignItem(design);
      getPuck().dispatch({
        type: "setData",
        data: (previous: Data) => ({
          ...previous,
          content: [
            ...previous.content.slice(0, library.index),
            item,
            ...previous.content.slice(library.index),
          ],
        }),
      });
      selectAfterInsert(library.index);
      closeLibrary();
    },
    [getPuck, library.index, selectAfterInsert, closeLibrary],
  );

  const searching = query.trim().length > 0;
  const categoryDesigns = searching
    ? searchSectionDesigns(allDesigns, query)
    : designsForCategory(allDesigns, category);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 p-4 outline-none sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Add section"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLibrary();
      }}
    >
      <div className="flex h-full max-h-[720px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-3">
            {mode !== "choose" ? (
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ← Back
              </button>
            ) : null}
            <h2 className="text-base font-semibold text-zinc-900">
              {mode === "choose"
                ? "What type of section?"
                : mode === "blank"
                  ? "Blank section"
                  : "Designed sections"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeLibrary}
            aria-label="Close"
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        {mode === "choose" ? (
          <div className="grid flex-1 gap-4 p-6 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("blank")}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 p-10 text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              <span className="text-3xl" aria-hidden="true">
                ▢
              </span>
              <span className="text-sm font-semibold">Blank</span>
              <span className="max-w-[26ch] text-center text-xs text-zinc-500">
                Start from an empty section with minimal defaults.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("designed")}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-zinc-200 p-10 text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              <span className="text-3xl" aria-hidden="true">
                ▦
              </span>
              <span className="text-sm font-semibold">Designed</span>
              <span className="max-w-[26ch] text-center text-xs text-zinc-500">
                Pick a professionally designed section and edit the content.
              </span>
            </button>
          </div>
        ) : null}

        {mode === "blank" ? (
          <div className="grid flex-1 auto-rows-max content-start gap-3 overflow-y-auto p-6 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(puckConfig.components).map(([type, component]) => (
              <div
                key={type}
                className="relative overflow-hidden rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 focus-within:ring-2 focus-within:ring-blue-600"
              >
                <BlockThumbnail name={type} theme={theme} />
                <span className="block border-t border-zinc-100 p-3">{component.label ?? type}</span>
                <button type="button" aria-label={`Insert blank ${component.label ?? type}`} onClick={() => insertBlank(type)} className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600" />
              </div>
            ))}
          </div>
        ) : null}

        {mode === "designed" ? (
          <>
          <div className="border-b border-zinc-200 px-5 py-3">
            <label htmlFor="section-design-search" className="sr-only">Search section designs</label>
            <input id="section-design-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all designs..." className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
            {searching ? <p role="status" className="mt-2 text-xs text-zinc-500">{categoryDesigns.length} results across all categories</p> : null}
            {savedError ? <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800">
              <span>{savedError}</span>
              <button type="button" className="underline" onClick={() => { setSavedError(null); setSavedDesigns(null); }}>Retry</button>
            </div> : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav aria-label="Section categories" className="grid max-h-36 shrink-0 grid-cols-2 overflow-y-auto border-b border-zinc-200 p-3 sm:block sm:max-h-none sm:w-44 sm:border-r sm:border-b-0">
              {SECTION_CATEGORIES.map((entry) => {
                const count = designsForCategory(allDesigns, entry).length;
                return (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => { setCategory(entry); setQuery(""); }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                      !searching && category === entry
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    <span>{entry}</span>
                    <span
                      className={
                        !searching && category === entry ? "text-zinc-300" : "text-zinc-400"
                      }
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="grid min-w-0 flex-1 auto-rows-max content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              {categoryDesigns.length === 0 ? (
                <p className="col-span-full py-12 text-center text-sm text-zinc-500">
                  {searching
                    ? "No designs match your search."
                    : savedDesigns === null
                    ? "Loading designs…"
                    : "No designs in this category yet."}
                </p>
              ) : (
                categoryDesigns.map((entry) => (
                  // NOT a <button>: the preview contains buttons, links
                  // and form fields, which cannot nest inside a button.
                  // The card is a div with an inert preview and a
                  // transparent overlay button for click and keyboard.
                  <div
                    key={entry.id}
                    className="group relative overflow-hidden rounded-xl border border-zinc-200 shadow-sm transition focus-within:border-zinc-400 hover:border-zinc-400 hover:shadow-md"
                  >
                    <div inert aria-hidden="true" className="pointer-events-none select-none">
                      <DesignThumbnail design={entry} theme={theme} />
                      <span className="block truncate border-t border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 group-hover:text-zinc-900">
                        {entry.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => insertDesign(entry)}
                      aria-label={`Insert ${entry.name}`}
                      className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
                    />
                  </div>
                ))
              )}
            </div>
          </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
