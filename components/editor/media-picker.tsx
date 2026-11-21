"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Upload, X } from "lucide-react";
import { searchStockPhotos, selectStockPhoto } from "@/app/editor/[pageId]/photo-actions";
import { listMedia, mediaOptions, prepareMediaUpload, validateMediaUrl } from "@/app/editor/[pageId]/media-actions";
import { createClient } from "@/lib/supabase/client";
import { type MediaImage, type MediaScope } from "@/lib/media";
import type { PhotoSearch } from "@/lib/photos/types";

type Tab = "stock" | "upload" | "library" | "url";
type Candidate = MediaImage & { photoId?: number; search?: { query: string; orientation: PhotoSearch["orientation"]; page: number } };
const control = "w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[#4B3FE0]";

export function MediaPicker({ scope, initialQuery = "", value, onSelect, onClose }: {
  scope: MediaScope; initialQuery?: string; value: string; onSelect: (image: MediaImage) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("stock");
  const [query, setQuery] = useState(initialQuery.slice(0, 100));
  const [orientation, setOrientation] = useState<PhotoSearch["orientation"]>("all");
  const [images, setImages] = useState<Candidate[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; bucket: string; path: string; url: string } | null>(null);
  const [alt, setAlt] = useState("");
  const [url, setUrl] = useState("");
  const [isAdmin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const scopeKey = scope.agency ? "agency" : scope.siteId;
  const latest = useRef(0);
  const preview = useRef<string | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const requests = latest;
    const uploadPreview = preview;
    const element = dialog.current;
    document.body.style.overflow = "hidden";
    element?.showModal();
    element?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = overflow; previous?.focus(); requests.current++;
      if (uploadPreview.current) URL.revokeObjectURL(uploadPreview.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void mediaOptions(scope).then((result) => {
      if (!active) return;
      if (result.status === "success") setAdmin(result.isAdmin);
      else setError(result.message);
    }).catch(() => { if (active) setError("Could not verify media access. Please reopen the picker."); });
    return () => { active = false; };
    // The scope is immutable for a mounted picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  async function find(loadMore = false) {
    const request = ++latest.current;
    setBusy(true); setError(""); setSearched(true);
    if (!loadMore) { setImages([]); setMore(false); setCandidate(null); }
    try {
      if (tab === "stock") {
        const nextPage = loadMore ? page + 1 : 1;
        const search = { query, orientation, page: nextPage };
        const result = await searchStockPhotos({ ...scope, ...search });
        if (latest.current !== request) return;
        if (result.status === "error") { setError(result.message); return; }
        const next = result.photos.map((photo) => ({ url: photo.previewUrl, alt: photo.alt, photoId: photo.id, search }));
        setImages((previous) => loadMore ? [...previous, ...next.filter((photo) => !previous.some((item) => item.photoId === photo.photoId))] : next);
        setPage(nextPage); setMore(result.hasMore);
      } else {
        const nextOffset = loadMore ? offset + 24 : 0;
        const result = await listMedia({ scope, query, offset: nextOffset });
        if (latest.current !== request) return;
        if (result.status === "error") { setError(result.message); return; }
        setImages((previous) => loadMore ? [...previous, ...result.images] : result.images);
        setOffset(nextOffset); setMore(result.hasMore);
      }
    } catch { if (latest.current === request) setError("Could not load images. Please retry."); }
    finally { if (latest.current === request) setBusy(false); }
  }
  function chooseTab(next: Tab) {
    latest.current++; setTab(next); setImages([]); setCandidate(null); setPendingUpload(null); setAlt(""); setSearched(false); setMore(false); setBusy(false); setError("");
    if (preview.current) { URL.revokeObjectURL(preview.current); preview.current = null; }
    setQuery(next === "stock" ? initialQuery.slice(0, 100) : "");
  }
  // Load a useful initial stock search, and the site's newest assets on Library.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === "library" || (tab === "stock" && query.trim())) void find();
    }, 0);
    return () => clearTimeout(timer);
    // Only tab changes auto-search; typing waits for Search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function upload(image: File) {
    setBusy(true); setError("");
    try {
      const label = image.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").slice(0, 500);
      const result = await prepareMediaUpload(scope, { name: image.name, type: image.type, size: image.size, alt: label });
      if (result.status === "error") { setError(result.message); return; }
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = URL.createObjectURL(image);
      setPendingUpload({ file: image, bucket: result.bucket, path: result.path, url: result.url });
      setCandidate({ url: preview.current, alt: label, name: image.name }); setAlt(label);
    } catch { setError("Upload failed. Please retry."); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError("");
    try {
      if (tab === "url") {
        const result = await validateMediaUrl(scope, url);
        if (result.status === "error") { setError(result.message); return; }
        onSelect({ url: result.url, alt }); onClose(); return;
      }
      if (!candidate) return;
      if (candidate.photoId && candidate.search) {
        const result = await selectStockPhoto({ ...scope, ...candidate.search, photoId: candidate.photoId, alt });
        if (result.status === "error") { setError(result.message); return; }
        onSelect({ url: result.url, alt });
      } else if (pendingUpload) {
        const { error: uploadError } = await createClient().storage.from(pendingUpload.bucket).upload(pendingUpload.path, pendingUpload.file, {
          contentType: pendingUpload.file.type, metadata: { alt },
        });
        if (uploadError) { setError("Upload failed. Please retry."); return; }
        onSelect({ url: pendingUpload.url, alt });
      } else onSelect({ url: candidate.url, alt });
      onClose();
    } catch { setError("The image could not be selected. Please retry."); }
    finally { setBusy(false); }
  }
  const tabs: { key: Tab; label: string }[] = [
    { key: "stock", label: "Stock photos" }, { key: "upload", label: "Upload" }, { key: "library", label: "Media library" },
    ...(isAdmin ? [{ key: "url" as const, label: "Paste URL" }] : []),
  ];
  return createPortal(<dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}
      className="platform-ui platform-media-dialog"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
        if (event.key === "Tab") {
          const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])]
            .filter((node) => !node.hidden && node.getAttribute("type") !== "file");
          const first = nodes[0], last = nodes.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
    <div className="flex max-h-[92dvh] flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-[#E8E7E3] bg-white px-5 py-4">
        <div><p className="platform-eyebrow mb-1">Media studio</p><h2 id={`${id}-title`} className="text-lg font-semibold">Choose image</h2>
          <p id={`${id}-description`} className="mt-1 text-xs text-zinc-500">Find, upload or reuse an image. Changes apply when you choose Use image.</p></div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close media picker" className="rounded-lg p-2 hover:bg-zinc-100"><X size={20} /></button>
      </header>
      <div role="tablist" aria-label="Image source" className="flex shrink-0 overflow-x-auto border-b border-[#E8E7E3] bg-white px-3">
        {tabs.map(({ key, label }, index) => <button key={key} type="button" role="tab" ref={(node) => { tabRefs.current[index] = node; }}
          id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} disabled={busy}
          className={`shrink-0 border-b-2 px-4 py-3 text-sm ${tab === key ? "border-[#4B3FE0] text-[#4B3FE0]" : "border-transparent text-zinc-600"}`}
          onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); chooseTab(tabs[next].key); tabRefs.current[next]?.focus(); }
          }} onClick={() => chooseTab(key)}>{label}</button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "stock" || tab === "library" ? <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1 text-xs font-medium">{tab === "stock" ? "Search photos" : "Search filename or alt text"}
              <input autoComplete="off" className={`${control} mt-1`} value={query} maxLength={100} disabled={busy} onChange={(event) => { setQuery(event.target.value); setMore(false); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!busy && (tab === "library" || query.trim())) void find(); } }} /></label>
            {tab === "stock" ? <label className="text-xs font-medium">Orientation
              <select className={`${control} mt-1`} disabled={busy} value={orientation} onChange={(event) => {
                const next = event.target.value;
                if (next === "all" || next === "horizontal" || next === "vertical" || next === "square") { setOrientation(next); setMore(false); }
              }}><option value="all">Any</option><option value="horizontal">Landscape</option><option value="vertical">Portrait</option><option value="square">Square</option></select>
            </label> : null}
            <button type="button" disabled={busy || (tab === "stock" && !query.trim())} onClick={() => void find()} className="platform-button"><Search size={16} />Search</button>
          </div>
          {tab === "stock" ? <p className="mb-4 text-xs text-zinc-500">Photos from <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer" className="underline">Pixabay</a></p> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy={busy}>
            {images.map((image) => <button key={image.url} type="button" disabled={busy} aria-label={`Select ${image.alt || image.name || "image"}`}
              aria-pressed={candidate?.url === image.url || (!candidate && value === image.url)}
              className={`group overflow-hidden rounded-xl border-2 text-left focus:outline-2 focus:outline-[#4B3FE0] ${candidate?.url === image.url || (!candidate && value === image.url) ? "border-[#4B3FE0]" : "border-transparent"}`}
              onClick={() => { setCandidate(image); setAlt(image.alt); setError(""); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
              <span className="block truncate bg-white p-2 text-xs">{image.name || image.alt}</span>
            </button>)}
            {busy ? Array.from({ length: 8 }, (_, index) => <div key={`loading-${index}`} className="aspect-[4/3] animate-pulse rounded-xl bg-[#E8E7E3]" />) : null}
          </div>
          {!busy && searched && !images.length && !error ? <p role="status" className="py-12 text-center text-sm text-zinc-500">No matching images. Your current image is unchanged.</p> : null}
          {more ? <button type="button" disabled={busy} onClick={() => void find(true)} className="platform-button mx-auto mt-5 flex">Load more</button> : null}
        </> : tab === "upload" ? <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault(); const image = event.dataTransfer.files[0]; if (image && !busy) void upload(image);
        }} className="rounded-xl border-2 border-dashed border-[#D6D4CD] bg-white p-10 text-center">
          <Upload className="mx-auto mb-4 text-zinc-400" size={32} />
          <p className="mb-3 text-sm">Drag an image here, or browse your device.</p>
          <button type="button" disabled={busy} onClick={() => file.current?.click()} className="platform-button">{busy ? "Uploading..." : "Browse files"}</button>
          <input ref={file} type="file" className="hidden" accept={scope.agency ? "image/png,image/jpeg,image/svg+xml,image/webp" : "image/png,image/jpeg,image/webp,image/gif,image/avif"}
            onChange={(event) => { const image = event.target.files?.[0]; if (image) void upload(image); event.target.value = ""; }} />
          <p className="mt-4 text-xs text-zinc-500">{scope.agency ? "PNG, JPEG, SVG or WebP, up to 2 MB." : "JPEG, PNG, GIF, WebP or AVIF, up to 50 MB. No SVG."}</p>
          {candidate ? <p role="status" className="mt-4 text-sm">Ready to upload {candidate.name}. Edit the alt text, then use this image.</p> : null}
        </div> : <label className="block text-sm">Image URL
          <input className={`${control} mt-2`} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." maxLength={2000} />
          <span className="mt-2 block text-xs text-zinc-500">Agency only. Use an allowed HTTPS URL or local path.</span>
        </label>}
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      </div>
      <footer className="flex shrink-0 flex-wrap items-end gap-3 border-t border-[#E8E7E3] bg-white px-5 py-4">
        {candidate ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.url} alt={alt} className="h-16 w-20 rounded-lg object-cover" />
        ) : null}
        <label className="min-w-48 flex-1 text-xs font-medium">Alt text
          <input className={`${control} mt-1`} disabled={busy} value={alt} maxLength={500} onChange={(event) => setAlt(event.target.value)} placeholder="Describe the image" /></label>
        <button type="button" disabled={busy || (tab === "url" ? !url.trim() : !candidate)} onClick={() => void apply()} className="platform-button platform-button-primary">
          {busy ? "Working..." : "Use image"}</button>
      </footer>
    </div>
  </dialog>, document.body);
}
