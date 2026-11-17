"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploadField, EditorSiteContext } from "@/components/editor/image-upload-field";
import type { SiteSeo } from "@/lib/seo";
import { publishPageSeo, savePageSeoDraft } from "@/app/(dashboard)/dashboard/sites/[siteId]/seo/actions";

export type PageSeoRow = {
  id: string;
  title: string;
  slug: string;
  seoTitle: string;
  description: string;
  socialImage: string;
  indexing: "inherit" | "index" | "noindex";
  score: number;
  hidden: boolean;
  lastPublished: string | null;
};

const fieldClass = "mt-1 w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm focus:border-[#4B3FE0] focus:outline-none";
const scoreColor = (score: number) => score === 100 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700";

export function PageSeoManager({ siteId, siteSeo, pages, averageScore }: {
  siteId: string; siteSeo: SiteSeo; pages: PageSeoRow[]; averageScore: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pages.find((page) => page.id === selectedId) ?? null;
  return <EditorSiteContext.Provider value={{ siteId }}>
    <section className="overflow-hidden rounded-xl border border-[#E8E7E3] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E7E3] px-5 py-4">
        <div>
          <h2 className="font-semibold">Pages</h2>
          <p className="mt-1 text-xs text-zinc-500">Review each page&apos;s draft SEO and publish changes when ready.</p>
        </div>
        <p className="text-sm">Site-wide average <span className={`ml-1 font-semibold ${scoreColor(averageScore)}`}>{averageScore}%</span></p>
      </header>
      {pages.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#F7F7F5] text-xs text-zinc-600">
            <tr>
              <th className="px-5 py-3 font-medium">Page</th>
              <th className="px-5 py-3 font-medium">SEO title</th>
              <th className="px-5 py-3 font-medium">Meta description</th>
              <th className="px-5 py-3 font-medium">Score</th>
              <th className="px-5 py-3 font-medium">Search visibility</th>
              <th className="px-5 py-3 font-medium">Last published</th>
              <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E7E3]">
            {pages.map((page) => <tr key={page.id}>
              <td className="px-5 py-4">
                <span className="block font-medium">{page.title}</span>
                <span className="text-xs text-zinc-500">{page.slug ? `/${page.slug}` : "/"}</span>
              </td>
              <td className="max-w-48 truncate px-5 py-4" title={page.seoTitle}>{page.seoTitle || "—"}</td>
              <td className="max-w-56 truncate px-5 py-4 text-zinc-600" title={page.description}>{page.description || "—"}</td>
              <td className="px-5 py-4"><span className={`rounded-full bg-[#F7F7F5] px-2.5 py-1 text-xs font-semibold ${scoreColor(page.score)}`}>{page.score}%</span></td>
              <td className="px-5 py-4">{page.hidden ? <span className="text-amber-700">Hidden</span> : <span className="text-green-700">Visible</span>}</td>
              <td className="px-5 py-4 text-zinc-600">{page.lastPublished ?? "Never"}</td>
              <td className="px-5 py-4 text-right">
                <button type="button" onClick={() => setSelectedId(page.id)} className="whitespace-nowrap font-medium text-[#4B3FE0] underline">Edit SEO</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="px-5 py-8 text-sm text-zinc-500">No pages yet.</p>}
    </section>
    {selected ? <PageSeoDrawer key={selected.id} siteId={siteId} siteSeo={siteSeo} page={selected} onClose={() => setSelectedId(null)} /> : null}
  </EditorSiteContext.Provider>;
}

function PageSeoDrawer({ siteId, siteSeo, page, onClose }: {
  siteId: string; siteSeo: SiteSeo; page: PageSeoRow; onClose: () => void;
}) {
  const router = useRouter();
  const [seoTitle, setSeoTitle] = useState(page.seoTitle);
  const [description, setDescription] = useState(page.description);
  const [socialImage, setSocialImage] = useState(page.socialImage);
  const [indexing, setIndexing] = useState(page.indexing);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fields = { seoTitle, description, socialImage, indexing };

  async function submit(kind: "save" | "publish") {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await (kind === "save" ? savePageSeoDraft : publishPageSeo)(siteId, page.id, fields);
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return;
      }
      setMessage({ text: result.success, error: false });
      router.refresh();
    } catch (error) {
      console.error(`Could not ${kind} page SEO`, error);
      setMessage({ text: "Could not save these SEO changes. Please try again.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
    <button type="button" aria-label="Close page SEO editor" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
    <aside role="dialog" aria-modal="true" aria-labelledby="page-seo-heading" className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[#E8E7E3] bg-[#F7F7F5] shadow-xl">
      <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-[#E8E7E3] bg-white px-6 py-5">
        <div><h2 id="page-seo-heading" className="text-lg font-semibold">Edit SEO</h2><p className="mt-1 text-sm text-zinc-500">{page.title} · {page.slug ? `/${page.slug}` : "/"}</p></div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-[#F7F7F5]">Close</button>
      </header>
      <div className="flex-1 space-y-5 p-6">
        <section className="space-y-4 rounded-xl border border-[#E8E7E3] bg-white p-4">
          <label className="block text-sm font-medium">SEO title
            <input className={fieldClass} maxLength={500} value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
            <span className="mt-1 block text-right text-xs text-zinc-500">{seoTitle.length}/60 characters</span>
          </label>
          <label className="block text-sm font-medium">Meta description
            <textarea className={fieldClass} rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
            <span className="mt-1 block text-right text-xs text-zinc-500">{description.length}/160 characters</span>
          </label>
          <div className="text-sm font-medium"><span>Social share image</span>
            <div className="mt-1"><ImageUploadField allowUrl value={socialImage} onChange={setSocialImage} /></div>
            {!socialImage && siteSeo.socialImage ? <p className="mt-1 text-xs text-zinc-500">Using the site default image.</p> : null}
          </div>
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Search visibility</legend>
            {([
              ["inherit", "Use site default"],
              ["index", "Allow search engines"],
              ["noindex", "Hide this page from search engines"],
            ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2">
              <input type="radio" name={`indexing-${page.id}`} checked={indexing === value} onChange={() => setIndexing(value)} />{label}
            </label>)}
          </fieldset>
        </section>
        <p className="text-xs text-zinc-600">These changes are saved to the page draft. Publish to make them live.</p>
        {message ? <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-red-700" : "text-zinc-600"}`}>{message.text}</p> : null}
      </div>
      <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#E8E7E3] bg-white px-6 py-4">
        <button type="button" disabled={busy !== null} onClick={() => void submit("save")} className="rounded-lg border border-[#E8E7E3] px-4 py-2 text-sm disabled:opacity-50">
          {busy === "save" ? "Saving..." : "Save draft"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void submit("publish")} className="rounded-lg bg-[#121212] px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy === "publish" ? "Publishing..." : "Publish to apply"}
        </button>
      </footer>
    </aside>
  </div>;
}
