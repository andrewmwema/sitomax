"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { importBlogBatch, previewBlogImport } from "@/app/(dashboard)/dashboard/sites/[siteId]/blog/import-actions";

type Preview = Extract<Awaited<ReturnType<typeof previewBlogImport>>, { digest: string }>;
type Result = Extract<Awaited<ReturnType<typeof importBlogBatch>>, { results: unknown }>["results"][number];
const input = "mt-1 w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm";

export function BlogImportPanel({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [feed, setFeed] = useState("");
  const [source, setSource] = useState<"file" | "feed">("file");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [keepPublished, setKeepPublished] = useState(false);

  function formData() {
    const form = new FormData();
    if (source === "file" && file) form.set("file", file);
    if (source === "feed") form.set("feed", feed.trim());
    return form;
  }
  function clearPreview() {
    setPreview(null); setResults([]); setError(""); setFinished(false);
  }
  async function loadPreview(event: FormEvent) {
    event.preventDefault();
    clearPreview();
    setWorking(true);
    try {
      const result = await previewBlogImport(siteId, formData());
      if ("digest" in result && result.digest) setPreview(result);
      else setError(result.error ?? "Could not preview this source.");
    } catch { setError("Could not preview this source. Please retry."); }
    finally { setWorking(false); }
  }
  async function runImport() {
    if (!preview) return;
    setWorking(true); setError(""); setResults([]);
    const form = formData();
    try {
      for (let offset = 0; offset < preview.rows.length; offset += preview.batchSize) {
        const batch = await importBlogBatch(siteId, form, { digest: preview.digest, offset, overwrite, keepPublished });
        if ("error" in batch && batch.error) { setError(batch.error); break; }
        if (batch.results) setResults((old) => [...old, ...batch.results]);
      }
    } catch { setError("Import stopped. Completed posts are listed below. Preview the source again before retrying."); }
    finally { setWorking(false); setFinished(true); router.refresh(); }
  }

  return <section className="max-w-3xl space-y-5 rounded-xl border border-[#E8E7E3] bg-white p-6">
    <header>
      <h2 className="text-lg font-semibold">Import blog posts</h2>
      <p className="mt-1 text-sm text-zinc-600">Import content and images you have permission to reuse. Preview what will be imported before making any changes.</p>
    </header>
    <form onSubmit={loadPreview} className="space-y-4">
      <fieldset disabled={working} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Source</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label><input type="radio" name="source" checked={source === "file"} onChange={() => { setSource("file"); clearPreview(); }} /> WordPress XML export</label>
          <label><input type="radio" name="source" checked={source === "feed"} onChange={() => { setSource("feed"); clearPreview(); }} /> RSS or Atom URL</label>
        </div>
        {source === "file" ? <label className="block text-sm">XML file (up to 2 MB, 250 posts)
          <input required={!file} type="file" accept=".xml,text/xml,application/xml" className={input}
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); clearPreview(); }} />
          {file ? <span className="mt-1 block text-xs text-zinc-600">Selected: {file.name}</span> : null}
        </label> : <label className="block text-sm">Public HTTPS feed URL
          <input required type="url" maxLength={2048} value={feed} className={input}
            onChange={(event) => { setFeed(event.target.value); clearPreview(); }} placeholder="https://example.com/feed.xml" />
        </label>}
      </fieldset>
      <button disabled={working} className="platform-button">Preview import</button>
    </form>
    {preview ? <div className="space-y-4">
      <h3 className="font-semibold">Preview: {preview.rows.length} posts</h3>
      <ul className="max-h-72 overflow-auto divide-y rounded-lg border text-sm">
        {preview.rows.map((row, i) => <li key={i} className="px-3 py-2">
          <strong>{row.title}</strong>
          {"slug" in row ? <>
            <p className="break-words text-zinc-600">/{row.slug}{row.author ? ` · ${row.author}` : ""}{row.category ? ` · ${row.category}` : ""}{row.date ? ` · ${row.date.slice(0, 10)}` : ""}
              {row.repeated ? " · Repeated in source (will skip)" : row.duplicate ? " · Existing slug" : ""} · {row.published ? "Published in source" : "Draft in source"}{row.hasCover ? " · Has cover image" : ""}</p>
            {row.excerpt ? <p className="mt-1 line-clamp-2 text-zinc-600">{row.excerpt}</p> : null}
          </> :
            <p className="text-red-700">{row.error}</p>}
        </li>)}
      </ul>
      <fieldset disabled={working || finished} className="space-y-2 text-sm">
        <legend className="mb-2 font-medium">Import options</legend>
        <label className="block"><input type="checkbox" checked={keepPublished} onChange={(event) => setKeepPublished(event.target.checked)} /> Keep published status (posts go live immediately)</label>
        <label className="block"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} /> Overwrite posts with the same slug, including their publication status</label>
      </fieldset>
      <button type="button" disabled={working || finished || !preview.rows.some((row) => "slug" in row)}
        onClick={() => void runImport()} className="platform-button platform-button-primary">Import posts</button>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <p role="status" className="text-sm text-zinc-600">{working ? preview ? `Processed ${results.length} of ${preview.rows.length} posts…` : "Preparing preview…" : ""}</p>
    {results.length ? <div>
      <h3 className="font-semibold">Import results</h3>
      <p className="mt-1 text-sm">{results.filter((r) => r.status === "imported").length} imported · {results.filter((r) => r.status === "skipped").length} skipped · {results.filter((r) => r.status === "error").length} errors</p>
      <ul className="mt-3 max-h-72 overflow-auto divide-y rounded-lg border text-sm">
        {results.map((result, i) => <li key={i} className="px-3 py-2">
          <strong>{result.title}</strong> — {result.status}{result.message ? `: ${result.message}` : ""}
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
