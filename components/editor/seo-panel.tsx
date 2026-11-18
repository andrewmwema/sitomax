"use client";

import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { TriangleAlert } from "lucide-react";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import type { SiteSeo } from "@/lib/seo";
import { seoChecklist } from "@/lib/seo-checklist";
import { editorTree } from "@/lib/editor/tree";

const usePuck = createUsePuck();
export type SeoPageSummary = {
  id: string;
  title: string | null;
  slug: string;
  score: number;
  hidden: boolean;
  hasPlaceholders: boolean;
};

export function SeoPanel({ siteId, pageId, pageTitle, publicUrl, siteSeo, pages = [], onSelectPage, isSwitching = false, switchError }: {
  siteId: string; pageId: string; pageTitle: string; publicUrl: string; siteSeo: SiteSeo;
  pages?: SeoPageSummary[];
  onSelectPage?: (pageId: string) => void;
  isSwitching?: boolean;
  switchError?: string | null;
}) {
  const data = usePuck((state) => state.appState.data);
  const getPuck = useGetPuck();
  const props = data.root.props ?? {};
  const seoTitle = typeof props.seoTitle === "string" ? props.seoTitle : "";
  const title = typeof props.seoTitle === "string" && props.seoTitle.trim()
    ? props.seoTitle : typeof props.title === "string" && props.title.trim() ? props.title : pageTitle;
  const description = typeof props.description === "string" ? props.description : "";
  const image = typeof props.socialImage === "string" ? props.socialImage : "";
  const indexing = props.indexing === "noindex" || props.indexing === "index" ? props.indexing : "inherit";
  const { checks, score } = seoChecklist(data, pageTitle, siteSeo);
  const rootClass = "block w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm focus:border-[#4B3FE0] focus:outline-none";
  const update = (key: string, value: string) => {
    getPuck().dispatch({
      type: "setData",
      data: (previous) => ({
        root: { ...previous.root, props: { ...previous.root.props, [key]: value } },
      }),
    });
  };
  const fix = (key: string, targetId?: string) => {
    if (targetId) {
      const entry = editorTree(getPuck().appState.data).find((candidate) => candidate.item.props.id === targetId);
      if (entry) {
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: entry.selector, rightSideBarVisible: true } });
        return;
      }
    }
    const target = key === "title" ? "seo-title" : key === "description" ? "seo-description" :
      key === "socialImage" ? "seo-social-image" : key === "indexing" ? "seo-indexing" : null;
    if (!target) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(target);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus();
      else element?.querySelector("button")?.focus();
    });
  };
  const labelStatus = (key: string, complete: boolean) => {
    if (complete) return "text-green-700";
    if (key === "indexing" || key === "socialImage" || key === "placeholders") return "text-amber-700";
    return "text-red-700";
  };
  const scoreColor = (value: number) => value === 100 ? "text-green-700" : value >= 50 ? "text-amber-700" : "text-red-700";

  return <div className="editor-panel flex flex-col gap-6">
    {pages.length ? <section aria-label="All pages">
      <h2 className="mb-3 text-sm font-semibold">All pages</h2>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto p-1">
        {pages.map((page) => {
          const current = page.id === pageId;
          const currentScore = current ? score : page.score;
          const currentHidden = current ? !checks.find((check) => check.key === "indexing")?.complete : page.hidden;
          const currentHasPlaceholders = current
            ? !checks.find((check) => check.key === "placeholders")?.complete
            : page.hasPlaceholders;
          return <li key={page.id}>
            <button type="button" aria-current={current ? "page" : undefined} disabled={current || isSwitching}
              onClick={() => onSelectPage?.(page.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                current ? "border-[#4B3FE0]/30 bg-[#4B3FE0]/5" : "border-transparent hover:bg-[#F7F7F5]"
              } disabled:cursor-default`}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{page.title || page.slug || "Home"}</span>
                <span className="mt-0.5 block truncate text-[#6B6A66]">{page.slug ? `/${page.slug}` : "/"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {currentHidden || currentHasPlaceholders ? <TriangleAlert size={14} aria-label={[
                  currentHidden ? "Hidden from search engines" : "",
                  currentHasPlaceholders ? "Has unreplaced placeholders" : "",
                ].filter(Boolean).join(" and ")} className="text-amber-700" /> : null}
                <span className={`rounded-full bg-[#F7F7F5] px-2 py-1 font-semibold ${scoreColor(currentScore)}`}>{currentScore}%</span>
              </span>
            </button>
          </li>;
        })}
      </ul>
      {switchError ? <p role="alert" className="mt-2 text-xs text-red-700">{switchError}</p> : null}
    </section> : null}
    <header className="editor-panel-header">
      <h2 className="text-sm font-semibold">Page SEO</h2>
      <p className="mt-1 text-xs text-[#6B6A66]">Changes save with your draft and go live when you publish.</p>
    </header>

    <section aria-label="Page SEO fields" className="flex flex-col gap-3">
      <label htmlFor="seo-title" className="text-xs font-medium">SEO title
        <input id="seo-title" className={rootClass} maxLength={500} value={seoTitle}
          placeholder={pageTitle || "Page title"} onChange={(event) => update("seoTitle", event.target.value)} />
        <span className={`mt-1 block text-right text-[11px] ${seoTitle.length > 60 ? "text-amber-700" : "text-[#6B6A66]"}`}>{seoTitle.length}/60 characters</span>
      </label>
      <label htmlFor="seo-description" className="text-xs font-medium">Meta description
        <textarea id="seo-description" className={rootClass} rows={4} maxLength={2000} value={description}
          placeholder="Describe this page for search results." onChange={(event) => update("description", event.target.value)} />
        <span className={`mt-1 block text-right text-[11px] ${description.length > 160 ? "text-amber-700" : "text-[#6B6A66]"}`}>{description.length}/160 characters</span>
      </label>
      <div id="seo-social-image" className="flex flex-col gap-1 text-xs font-medium">
        <span>Social share image</span>
        <ImageUploadField value={image} onChange={(value) => update("socialImage", value)} />
      </div>
      <fieldset id="seo-indexing" className="flex flex-col gap-2 text-xs">
        <legend className="font-medium">Search visibility</legend>
        {([
          ["inherit", "Use site default"],
          ["index", "Allow search engines"],
          ["noindex", "Hide this page from search engines"],
        ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2">
          <input type="radio" name="seo-indexing" value={value} checked={indexing === value} onChange={() => update("indexing", value)} />{label}
        </label>)}
      </fieldset>
    </section>

    <section aria-label="Google search preview" className="platform-panel p-4">
      <h3 className="text-xs font-semibold">Google search preview</h3>
      <div className="mt-3">
        <p className="truncate text-xs text-[#3D3C39]">{publicUrl}</p>
        <p className="mt-1 line-clamp-2 text-lg leading-6 text-[#1a0dab]">{title || "Your page title"}</p>
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#4d5156]">{description || "Add a meta description to preview how this page may appear in search results."}</p>
      </div>
    </section>

    <section aria-label="Social share preview" className="platform-panel overflow-hidden">
      <h3 className="px-3 pt-3 text-xs font-semibold">Social share preview</h3>
      <div className="mt-3 flex aspect-[1.91/1] items-center justify-center bg-[#F7F7F5]">
        {image ? (
          // Editor previews accept user-selected media from arbitrary hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : <span className="px-4 text-xs text-[#6B6A66]">Add a social image to preview your share card.</span>}
      </div>
      <div className="bg-[#F7F7F5] px-3 py-2">
        <p className="truncate text-xs uppercase text-[#6B6A66]">{new URL(publicUrl).host}</p>
        <p className="truncate text-sm font-semibold">{title || "Your page title"}</p>
        <p className="line-clamp-2 text-xs text-[#6B6A66]">{description || "Your page description will appear here."}</p>
      </div>
    </section>

    <section aria-label="SEO checklist" className="platform-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">SEO checklist</h3>
        <span className={`text-xs font-semibold ${score >= 80 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700"}`}>{score}%</span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {checks.map((check) => <li key={check.key} className="flex items-start justify-between gap-2 text-xs">
          <span className={labelStatus(check.key, check.complete)}>{check.complete ? "✓" : "!"} {check.label}</span>
          {!check.complete ? <button type="button" className="shrink-0 text-[#4B3FE0] underline"
            aria-label={`Fix ${check.label}`} onClick={() => fix(check.key, check.targetId)}>Fix</button> : null}
        </li>)}
      </ul>
    </section>

    <section className="rounded-xl bg-[#F7F7F5] p-3">
      <a href={`/dashboard/sites/${siteId}/seo`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#4B3FE0] underline">Site SEO settings ↗</a>
      <p className="mt-1 text-xs text-[#6B6A66]">Business info, tracking codes and redirects.</p>
    </section>
  </div>;
}
