"use client";

import { useMemo, useState } from "react";
import { DesignThumbnail } from "@/components/editor/design-thumbnail";
import {
  SECTION_CATEGORIES,
  designsForCategory,
  searchSectionDesigns,
  sectionCatalog,
  type SectionCategory,
} from "@/lib/sections/catalog";
import { THEME_PRESETS } from "@/lib/theme/presets";

const VIEWPORTS = [375, 768, 1280, 1440] as const;
type ViewportWidth = (typeof VIEWPORTS)[number];
type CategoryFilter = "all" | SectionCategory;

const availableCategories = SECTION_CATEGORIES.filter((category) =>
  designsForCategory(sectionCatalog, category).length > 0,
);

export function SectionsShowcase() {
  const [themeId, setThemeId] = useState(THEME_PRESETS[0]?.id ?? "");
  const [viewportWidth, setViewportWidth] = useState<ViewportWidth>(1280);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");

  const theme = THEME_PRESETS.find((preset) => preset.id === themeId)?.theme
    ?? THEME_PRESETS[0]?.theme
    ?? {};
  const designs = useMemo(() => {
    const searched = searchSectionDesigns(sectionCatalog, query);
    return category === "all"
      ? searched
      : designsForCategory(searched, category);
  }, [category, query]);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">SitoMax · Section preview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Section library showcase</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Preview every catalog design with a curated theme and a real responsive iframe viewport.
              Existing saved sections remain on their original design version.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-zinc-700">
              Theme
              <select
                aria-label="Showcase theme"
                value={themeId}
                onChange={(event) => setThemeId(event.target.value)}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal"
              >
                {THEME_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-zinc-700">
              Category
              <select
                aria-label="Filter by category"
                value={category}
                onChange={(event) => setCategory(event.target.value as CategoryFilter)}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal"
              >
                <option value="all">All categories</option>
                {availableCategories.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry} ({designsForCategory(sectionCatalog, entry).length})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-zinc-700">
              Search designs
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, category or block"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preview viewport width">
            <span className="mr-1 text-xs font-semibold text-zinc-700">Viewport</span>
            {VIEWPORTS.map((width) => (
              <button
                key={width}
                type="button"
                aria-pressed={viewportWidth === width}
                onClick={() => setViewportWidth(width)}
                className={`min-h-10 rounded-md border px-3 text-xs font-medium transition ${
                  viewportWidth === width
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                }`}
              >
                {width}px
              </button>
            ))}
            <span className="text-xs text-zinc-500">The iframe renders at this width before being scaled to fit.</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            {designs.length} {designs.length === 1 ? "design" : "designs"}
          </h2>
          <span className="text-xs text-zinc-500">{THEME_PRESETS.find((preset) => preset.id === themeId)?.label} · {viewportWidth}px</span>
        </div>
        {designs.length > 0 ? (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {designs.map((design) => (
              <article key={design.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{design.name}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">{design.category} · {design.blockType}</p>
                  </div>
                  <code className="shrink-0 rounded bg-zinc-100 px-1.5 py-1 text-[10px] text-zinc-500">{design.id}</code>
                </div>
                <div className="border-y border-zinc-100 bg-zinc-100/70 p-3">
                  <div className="mx-auto w-full" style={{ maxWidth: viewportWidth }}>
                    <DesignThumbnail
                      design={design}
                      theme={theme}
                      viewportWidth={viewportWidth}
                    />
                  </div>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs leading-5 text-zinc-600">{design.description}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {design.bestFor.map((tag) => (
                      <li key={tag} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600">{tag}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-5 py-10 text-center text-sm text-zinc-500">
            No designs match those filters.
          </p>
        )}
      </section>
    </main>
  );
}
