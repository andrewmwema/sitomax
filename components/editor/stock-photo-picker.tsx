"use client";

import { useState } from "react";
import { searchStockPhotos, selectStockPhoto } from "@/app/editor/[pageId]/photo-actions";
import type { PhotoSearch } from "@/lib/photos/types";

export function StockPhotoPicker({ siteId, onSelect, readOnly }: {
  siteId: string; onSelect: (url: string) => void; readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<PhotoSearch["orientation"]>("all");
  const [photos, setPhotos] = useState<{ id: number; previewUrl: string; alt: string }[]>([]);
  const [search, setSearch] = useState<{ query: string; orientation: PhotoSearch["orientation"] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState({ name: "Pixabay", url: "https://pixabay.com/" });
  async function find() {
    setBusy(true); setError(""); setPhotos([]); setSearch(null);
    try {
      const input = { query, orientation };
      const result = await searchStockPhotos({ ...input, siteId });
      if (result.status === "error") { setError(result.message); return; }
      setPhotos(result.photos); setSearch(input); setSource(result.source);
    } catch {
      setError("Photo search could not be reached. Please retry.");
    } finally { setBusy(false); }
  }
  async function select(photoId: number) {
    if (!search) return;
    setBusy(true); setError("");
    try {
      const result = await selectStockPhoto({ ...search, siteId, photoId });
      if (result.status === "error") { setError(result.message); return; }
      onSelect(result.url);
    } catch {
      setError("The photo could not be saved. Please retry.");
    } finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2">
    <p className="text-xs">Photos from <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.name}</a></p>
    <label className="text-xs">Search photos
      <input value={query} maxLength={100} disabled={readOnly || busy} className="mt-1 w-full rounded border px-2 py-1 text-xs"
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); if (query.trim() && !busy && !readOnly) void find(); }
        }} />
    </label>
    <label className="text-xs">Orientation
      <select value={orientation} disabled={readOnly || busy} className="mt-1 w-full rounded border px-2 py-1 text-xs"
        onChange={(event) => {
          const value = event.target.value;
          if (value === "all" || value === "horizontal" || value === "vertical") setOrientation(value);
        }}>
        <option value="all">Any</option><option value="horizontal">Landscape</option><option value="vertical">Portrait</option>
      </select>
    </label>
    <button type="button" disabled={readOnly || busy || !query.trim()} onClick={() => void find()}
      className="rounded border px-2 py-1 text-xs disabled:opacity-50">{busy ? "Working…" : "Search"}</button>
    {photos.length ? <div className="grid grid-cols-2 gap-2">{photos.map((photo) => <button key={photo.id}
      type="button" disabled={readOnly || busy} onClick={() => void select(photo.id)} aria-label={`Use ${photo.alt}`}
      className="overflow-hidden rounded border disabled:opacity-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.previewUrl} alt={photo.alt} className="h-20 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
    </button>)}</div> : search ? <p role="status" className="text-xs">No matching photos. Your current image or placeholder is unchanged.</p> : null}
    {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
  </div>;
}
