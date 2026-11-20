"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Eye, ImagePlus, Plus, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import type { CSSProperties } from "react";
import { MediaPicker } from "@/components/editor/media-picker";
import { EditorSiteContext } from "@/components/editor/image-upload-field";
import { blogButtonSchema, blogContentSchema, blogSlugSchema, type BlogBlock, type BlogContent, type BlogPostFields } from "@/lib/blog";
import { fontFamily, googleFontsUrl, type CuratedFont } from "@/lib/theme/fonts";
import { RichTextContent } from "@/components/blocks/ui/rich-text";
import { BlogRichTextEditor, type BlogTextSelection } from "./blog-rich-text-editor";
import { siteDateTimeInput, siteLocalTimeToUtc } from "@/lib/blog-date";
import { blogManagerHref } from "@/lib/blog-navigation";
import {
  createBlogTag, listBlogPostVersions, restoreBlogPostVersion, saveBlogPost, setBlogPostStatus,
} from "@/app/(dashboard)/dashboard/sites/[siteId]/blog/actions";
import { blogWriterAi } from "@/app/(dashboard)/dashboard/sites/[siteId]/blog/ai-actions";
import type { BlogManagerAuthor, BlogManagerCategory, BlogManagerPost, BlogManagerTag } from "./blog-manager";

type Version = { id: string; created_at: string };
type AiSelection = BlogTextSelection & { blockIndex: number };
type BlogAiResult =
  | { mode: "draft"; title: string; subtitle: string; excerpt: string; content: BlogContent; notes: string[] }
  | { mode: "rewrite"; text: string; notes: string[] }
  | {
    mode: "suggest"; title: string; subtitle: string; excerpt: string; seo_title: string; seo_description: string;
    cover_alt: string; tag_names: string[]; category_id: string | null; notes: string[];
  };
type Props = {
  siteId: string;
  editorPageId: string | null;
  initialTab: "status" | "details";
  headingFont: CuratedFont;
  bodyFont: CuratedFont;
  post: BlogPostFields;
  postId: string;
  status: "draft" | "scheduled" | "published";
  publishedAt: string | null;
  publishAt: string | null;
  hasScheduledSnapshot: boolean;
  hasUnpublishedChanges: boolean;
  timezone: string;
  categories: BlogManagerCategory[];
  authors: BlogManagerAuthor[];
  tags: BlogManagerTag[];
  adjacentPosts: Pick<BlogManagerPost, "id" | "title">[];
};

const fieldClass = "w-full rounded-lg border border-[#E8E7E3] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[#4B3FE0]";
const blockKinds = ["paragraph", "heading", "list", "quote", "callout", "image", "gallery", "video", "divider", "table"] as const;
type BlockKind = (typeof blockKinds)[number];

function freshBlock(kind: BlockKind): BlogBlock {
  switch (kind) {
    case "paragraph": return { type: kind, html: "" };
    case "heading": return { type: kind, level: 2, text: "" };
    case "list": return { type: kind, ordered: false, items: [""] };
    case "quote": return { type: kind, text: "", attribution: "" };
    case "callout": return { type: kind, title: "", text: "" };
    case "image": return { type: kind, url: "", alt: "", caption: "" };
    case "gallery": return { type: kind, images: [] };
    case "video": return { type: kind, url: "", title: "" };
    case "divider": return { type: kind };
    case "table": return { type: kind, rows: [["", ""]] };
  }
}

function textFromHtml(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "").replaceAll("&nbsp;", " ").replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

export function BlogPostEditor(props: Props) {
  const router = useRouter();
  const [form, setForm] = useState(props.post);
  const [blockKeys, setBlockKeys] = useState(() => props.post.draft_content.blocks.map((_, index) => index));
  const nextBlockKey = useRef(blockKeys.length);
  const formRef = useRef(form);
  const revision = useRef(0);
  const autosaveTimer = useRef<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(true);
  const [blockInsertAt, setBlockInsertAt] = useState<number | null>(null);
  const [tab, setTab] = useState<"status" | "details" | "seo">(props.initialTab);
  const [preview, setPreview] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(() => props.publishAt
    ? siteDateTimeInput(new Date(props.publishAt), props.timezone)
    : siteDateTimeInput(new Date(Date.now() + 60 * 60 * 1000), props.timezone));
  const [scheduleError, setScheduleError] = useState("");
  const [status, setStatus] = useState(props.status);
  const [hasScheduledSnapshot, setHasScheduledSnapshot] = useState(props.hasScheduledSnapshot);
  const [publishedAt, setPublishedAt] = useState(props.publishedAt);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(props.hasUnpublishedChanges);
  const [picker, setPicker] = useState<"cover" | "thumbnail" | number | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagError, setTagError] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionOpen, setVersionOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"draft" | "rewrite" | "suggest">("draft");
  const [aiTopic, setAiTopic] = useState("");
  const [aiInstruction, setAiInstruction] = useState<"improve" | "shorten" | "expand" | "tone">("improve");
  const [aiTone, setAiTone] = useState("");
  const [aiSelection, setAiSelection] = useState<AiSelection | null>(null);
  const [aiResultSelection, setAiResultSelection] = useState<AiSelection | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<BlogAiResult | null>(null);

  function change(update: (previous: BlogPostFields) => BlogPostFields) {
    setForm((previous) => {
      const next = update(previous);
      formRef.current = next;
      return next;
    });
    revision.current++;
    setDirty(true);
    setSaved(false);
    setError("");
    if (status === "published" || status === "scheduled") setHasUnpublishedChanges(true);
  }

  const persist = useCallback(async (snapshot = formRef.current, expectedRevision = revision.current) => {
    setBusy(true);
    setError("");
    try {
      const result = await saveBlogPost(props.postId, snapshot);
      if (result.status === "error") { setError(result.message); return false; }
      if (revision.current === expectedRevision) {
        setDirty(false);
        setSaved(true);
      }
      return true;
    } catch {
      setError("Could not save your draft. Your changes are still on this page.");
      return false;
    } finally { setBusy(false); }
  }, [props.postId]);

  useEffect(() => {
    if (!dirty) return;
    const snapshot = form;
    const expectedRevision = revision.current;
    const timer = window.setTimeout(() => { void persist(snapshot, expectedRevision); }, 900);
    autosaveTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [dirty, form, persist]);

  async function changeStatus(next: "draft" | "scheduled" | "published") {
    if (busy) return;
    const expectedRevision = revision.current;
    if (dirty) {
      window.clearTimeout(autosaveTimer.current);
      if (!(await persist()) || revision.current !== expectedRevision) return;
    }
    setBusy(true); setError(""); setScheduleError("");
    try {
      const result = await setBlogPostStatus(props.postId, next, next === "scheduled" ? scheduleTime : undefined);
      if (result.status === "error") {
        if (next === "scheduled") setScheduleError(result.message);
        else setError(result.message);
        return;
      }
      setStatus(next);
      setHasScheduledSnapshot(next === "scheduled");
      if (revision.current === expectedRevision) setHasUnpublishedChanges(false);
      setPublishedAt(next === "published" ? new Date().toISOString() : next === "draft" ? null : publishedAt);
      router.refresh();
    } catch {
      setError("Could not update the post status.");
    } finally { setBusy(false); }
  }

  function updateBlock(index: number, block: BlogBlock) {
    change((previous) => ({ ...previous, draft_content: {
      ...previous.draft_content,
      blocks: previous.draft_content.blocks.map((item, at) => at === index ? block : item),
    } }));
  }
  function clearSelection() {
    setAiSelection(null);
    setAiResultSelection(null);
  }
  function addBlock(block: BlogBlock, before?: number) {
    clearSelection();
    const key = nextBlockKey.current++;
    setBlockKeys((keys) => {
      const next = [...keys];
      next.splice(before ?? keys.length, 0, key);
      return next;
    });
    change((previous) => {
      const blocks = [...previous.draft_content.blocks];
      blocks.splice(before ?? blocks.length, 0, block);
      return { ...previous, draft_content: { version: 1, blocks } };
    });
  }
  function removeBlock(index: number) {
    clearSelection();
    setBlockInsertAt(null);
    setBlockKeys((keys) => keys.filter((_, at) => at !== index));
    change((previous) => ({ ...previous, draft_content: {
      version: 1, blocks: previous.draft_content.blocks.filter((_, at) => at !== index),
    } }));
  }
  function moveBlock(index: number, by: number) {
    const to = index + by;
    if (to < 0 || to >= form.draft_content.blocks.length) return;
    clearSelection();
    setBlockInsertAt(null);
    setBlockKeys((keys) => {
      const next = [...keys];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    change((previous) => {
      const blocks = [...previous.draft_content.blocks];
      [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
      return { ...previous, draft_content: { version: 1, blocks } };
    });
  }
  async function addTag(event: FormEvent) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    setTagError("");
    const result = await createBlogTag(props.siteId, name);
    if (result.status === "error" || !result.tagId) { setTagError(result.message); return; }
    change((previous) => ({ ...previous, tag_ids: [...new Set([...previous.tag_ids, result.tagId!])] }));
    setTagName("");
    router.refresh();
  }
  async function showVersions() {
    try {
      const result = await listBlogPostVersions(props.postId);
      setVersions(result); setVersionOpen(true);
    } catch { setError("Could not load revision history."); }
  }
  async function restore(versionId: string) {
    const result = await restoreBlogPostVersion(props.postId, versionId);
    if (result.status === "error") { setError(result.message); return; }
    if (result.content) {
      const content = result.content;
      resetBlockKeys(content);
      change((previous) => ({ ...previous, draft_content: content }));
    }
    setVersionOpen(false);
  }
  async function requestBlogAi() {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError("");
    setAiResult(null);
    setAiResultSelection(null);
    try {
      const request = aiMode === "draft"
        ? { mode: "draft" as const, siteId: props.siteId, topic: aiTopic }
        : aiMode === "rewrite"
          ? {
            mode: "rewrite" as const, siteId: props.siteId, text: aiSelection?.text ?? "",
            instruction: aiInstruction, tone: aiTone,
          }
          : {
            mode: "suggest" as const, siteId: props.siteId, title: form.title, subtitle: form.subtitle,
            excerpt: form.excerpt,
            bodyText: form.draft_content.blocks.map((block) => block.type === "paragraph" ? textFromHtml(block.html)
              : block.type === "heading" ? block.text
                : block.type === "list" ? block.items.join("\n")
                  : block.type === "quote" ? block.text
                    : block.type === "callout" ? `${block.title}\n${block.text}` : "").filter(Boolean).join("\n\n").slice(0, 12000),
            coverDescription: form.cover_alt,
          };
      const response = await blogWriterAi(request);
      if (response.status === "error") { setAiError(response.message); return; }
      setAiResult(response.result);
      setAiResultSelection(response.result.mode === "rewrite" ? aiSelection : null);
    } catch {
      setAiError("Could not request writing suggestions. Please try again.");
    } finally { setAiBusy(false); }
  }
  function applyRewrite() {
    if (aiResult?.mode !== "rewrite" || !aiResultSelection) return;
    if (!aiResultSelection.replace(aiResult.text)) {
      setAiError("The selected text changed. Select it again before applying this rewrite.");
      return;
    }
    setAiResult(null);
    setAiSelection(null);
    setAiResultSelection(null);
  }
  async function applySuggestions() {
    if (aiResult?.mode !== "suggest") return;
    setAiError("");
    const tagIds = [...form.tag_ids];
    let tagError = "";
    for (const name of aiResult.tag_names) {
      const existing = props.tags.find((tag) => tag.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing) { tagIds.push(existing.id); continue; }
      try {
        const result = await createBlogTag(props.siteId, name);
        if (result.status === "error" || !result.tagId) {
          tagError = `SEO fields were applied, but the tag “${name}” could not be added.`;
          break;
        }
        tagIds.push(result.tagId);
      } catch {
        tagError = `SEO fields were applied, but the tag “${name}” could not be added.`;
        break;
      }
    }
    change((previous) => ({
      ...previous,
      title: aiResult.title || previous.title,
      subtitle: aiResult.subtitle || previous.subtitle,
      excerpt: aiResult.excerpt || previous.excerpt,
      seo_title: aiResult.seo_title || previous.seo_title,
      seo_description: aiResult.seo_description || previous.seo_description,
      cover_alt: aiResult.cover_alt || previous.cover_alt,
      category_id: aiResult.category_id ?? previous.category_id,
      tag_ids: [...new Set(tagIds)].slice(0, 50),
    }));
    setAiError(tagError);
    setAiResult(null);
    setAiResultSelection(null);
    router.refresh();
  }
  function applyDraft() {
    if (aiResult?.mode !== "draft") return;
    resetBlockKeys(aiResult.content);
    change((previous) => ({
      ...previous, title: aiResult.title, subtitle: aiResult.subtitle, excerpt: aiResult.excerpt,
      draft_content: aiResult.content,
    }));
    setAiResult(null);
  }
  function resetBlockKeys(content: BlogContent) {
    clearSelection();
    setBlockInsertAt(null);
    setBlockKeys(content.blocks.map(() => nextBlockKey.current++));
  }
  const blocks = form.draft_content.blocks;
  const siteHref = blogManagerHref(props.siteId, props.editorPageId);
  const postIndex = props.adjacentPosts.findIndex(({ id }) => id === props.postId);
  const slugMessage = blogSlugSchema.safeParse(form.slug);
  const utcSchedule = siteLocalTimeToUtc(scheduleTime, props.timezone);

  return <EditorSiteContext.Provider value={{ siteId: props.siteId }}>
    <>
    <link rel="stylesheet" href={googleFontsUrl([props.headingFont, props.bodyFont])} />
    <main className="platform-ui min-h-screen bg-[#FBFBFA]"
      style={{ "--font-heading": fontFamily(props.headingFont), "--font-body": fontFamily(props.bodyFont), fontFamily: "var(--font-body)" } as CSSProperties}>
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-[#E8E7E3] bg-white/95 px-4 backdrop-blur sm:px-7">
        {props.editorPageId ? <button type="button" className="platform-button" disabled={busy}
          onClick={() => void navigateAfterSave(`/editor/${props.editorPageId}`)}><ArrowLeft size={15} />Back to editor</button> : null}
        <button type="button" className="platform-button" disabled={busy}
          onClick={() => void navigateAfterSave(siteHref)} aria-label="Back to posts">Posts</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{form.title || "Untitled post"}</p>
          <p role={error ? "alert" : "status"} className={`text-xs ${error ? "text-red-700" : "text-zinc-500"}`}>
            {error || (busy ? "Saving…" : dirty ? "Unsaved changes" : saved ? <><Check size={11} className="mr-1 inline" />Saved</> : "")}
          </p>
        </div>
        <button type="button" className="platform-button" onClick={() => setPreview(!preview)}><Eye size={14} />{preview ? "Continue editing" : "Preview"}</button>
        <button type="button" className="platform-button" aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}><Sparkles size={14} />Writing assistant</button>
        <button type="button" disabled={busy || !dirty} onClick={() => void persist()} className="platform-button">Save draft</button>
        <button type="button" onClick={() => setPanel(!panel)} aria-label="Toggle post settings" aria-expanded={panel} className="platform-button"><Settings2 size={15} /></button>
        <button type="button" disabled={busy || (status === "published" && !hasUnpublishedChanges)} onClick={() => void changeStatus("published")} className="platform-button platform-button-primary">
          {status === "published" ? hasUnpublishedChanges ? "Republish" : "Published" : "Publish"}
        </button>
      </header>
      <div className={`mx-auto grid min-h-[calc(100vh-64px)] max-w-[1480px] ${panel ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"}`}>
        <section className="min-w-0 px-4 py-8 sm:px-8 lg:py-12">
          <div className="mx-auto max-w-[760px]">
            {aiOpen && !preview ? <BlogAiPanel mode={aiMode} setMode={(mode) => {
              setAiMode(mode); setAiResult(null); setAiResultSelection(null); setAiError("");
            }} topic={aiTopic} setTopic={setAiTopic}
              instruction={aiInstruction} setInstruction={setAiInstruction} tone={aiTone} setTone={setAiTone}
              selectedText={aiResultSelection?.text ?? aiSelection?.text ?? ""} busy={aiBusy} error={aiError} result={aiResult}
              categories={props.categories} onRequest={() => void requestBlogAi()} onApplyDraft={applyDraft}
              onApplyRewrite={applyRewrite} onApplySuggestions={() => void applySuggestions()}
              onDismiss={() => { setAiOpen(false); setAiResult(null); setAiResultSelection(null); setAiError(""); }} /> : null}
            {preview ? <PostPreview form={form} /> : <>
              <label className="mb-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">Post title
                <input value={form.title} maxLength={200} onChange={(event) => change((previous) => ({ ...previous, title: event.target.value }))}
                  placeholder="Give your post a title" className="mt-2 w-full border-0 bg-transparent p-0 text-4xl font-semibold tracking-tight text-zinc-900 placeholder:text-zinc-300 focus:outline-none sm:text-5xl"
                  style={{ fontFamily: "var(--font-heading)" }} />
                <span className="mt-2 block text-right text-xs font-normal tracking-normal text-zinc-400">{form.title.length}/200</span>
              </label>
              <label className="mb-8 block"><span className="sr-only">Subtitle</span>
                <input value={form.subtitle} maxLength={300} onChange={(event) => change((previous) => ({ ...previous, subtitle: event.target.value }))}
                  placeholder="Add a subtitle…" className="w-full border-0 bg-transparent p-0 text-xl leading-relaxed text-zinc-500 placeholder:text-zinc-300 focus:outline-none" />
              </label>
              <div className="mb-7 border-y border-[#E8E7E3] py-3 text-xs text-zinc-500">
                {form.cover_image ? <span>Main image selected</span> : <span>No cover image</span>}
                <span className="px-2">·</span><span>{blocks.length} {blocks.length === 1 ? "block" : "blocks"}</span>
                {form.cover_image ? <button type="button" onClick={() => setPicker("cover")} className="ml-3 text-[#4B3FE0] underline">Edit image</button> : null}
              </div>
              <BlockMenu open={blockInsertAt === 0} onToggle={() => setBlockInsertAt(blockInsertAt === 0 ? null : 0)}
                count={blocks.length} onAdd={(block) => { addBlock(block); setBlockInsertAt(null); }} />
              <div className="space-y-4">
                {blocks.map((block, index) => <div key={blockKeys[index]}><BlockEditor block={block} index={index}
                  count={blocks.length} onChange={(next) => updateBlock(index, next)}
                  onMove={(by) => moveBlock(index, by)} onRemove={() => removeBlock(index)}
                  selected={aiSelection?.blockIndex === index}
                  onSelection={(selection) => setAiSelection((current) => selection ? { ...selection, blockIndex: index }
                    : current?.blockIndex === index ? null : current)}
                  onRewrite={() => { setAiMode("rewrite"); setAiOpen(true); setAiResult(null); setAiResultSelection(null); setAiError(""); }}
                  onChooseImage={() => setPicker(index)} onSlash={() => setBlockInsertAt(index + 1)} />
                  <BlockMenu compact open={blockInsertAt === index + 1}
                    onToggle={() => setBlockInsertAt(blockInsertAt === index + 1 ? null : index + 1)}
                    count={blocks.length} onAdd={(next) => { addBlock(next, index + 1); setBlockInsertAt(null); }} />
                </div>)}
              </div>
              {!blocks.length ? <p className="mt-2 text-sm text-zinc-500">Choose Add text to start writing, or start with a draft from the Writing assistant.</p> : null}
              <label className="mt-10 block border-t border-[#E8E7E3] pt-5 text-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Excerpt</span>
                <textarea value={form.excerpt} maxLength={500} rows={3} onChange={(event) => change((previous) => ({ ...previous, excerpt: event.target.value }))}
                  placeholder="Write a short summary for your post…" className={`${fieldClass} resize-y`} />
                <span className="mt-1 block text-right text-xs text-zinc-400">{form.excerpt.length}/500</span>
              </label>
            </>}
          </div>
        </section>
        {panel ? <aside className="border-t border-[#E8E7E3] bg-white lg:border-t-0 lg:border-l">
          <div className="sticky top-16 max-h-[calc(100vh-64px)] overflow-y-auto p-4 sm:p-5">
            <header className="flex items-center justify-between">
              <div><p className="text-xs text-zinc-500">Post settings</p><h2 className="font-semibold">Details</h2></div>
              <div className="flex items-center gap-1">
                <button type="button" disabled={busy || postIndex <= 0} onClick={() => stepPost(-1)} aria-label="Previous post" className="rounded-lg p-2 hover:bg-zinc-100"><ChevronLeft size={17} /></button>
                <button type="button" disabled={busy || postIndex < 0 || postIndex === props.adjacentPosts.length - 1}
                  onClick={() => stepPost(1)} aria-label="Next post" className="rounded-lg p-2 hover:bg-zinc-100"><ChevronRight size={17} /></button>
              </div>
            </header>
            <nav aria-label="Post settings tabs" className="mt-4 grid grid-cols-3 border-b border-[#E8E7E3] text-xs">
              {(["status", "details", "seo"] as const).map((name) => <button key={name} type="button" onClick={() => setTab(name)}
                aria-current={tab === name ? "page" : undefined} className={`border-b-2 py-2 capitalize ${tab === name ? "border-[#4B3FE0] font-semibold text-[#3025B8]" : "border-transparent text-zinc-500"}`}>{name}</button>)}
            </nav>
            {tab === "status" ? <StatusSettings status={status} publishedAt={publishedAt}
              hasUnpublishedChanges={hasUnpublishedChanges} hasScheduledSnapshot={hasScheduledSnapshot}
              slug={form.slug} slugMessage={slugMessage.success ? "" : slugMessage.error.issues[0]?.message ?? ""}
              onSlug={(slug) => change((previous) => ({ ...previous, slug }))} timezone={props.timezone}
              scheduleTime={scheduleTime} setScheduleTime={setScheduleTime} utcSchedule={utcSchedule}
              scheduleError={scheduleError} busy={busy} versions={versions} onChangeStatus={changeStatus}
              onVersions={() => void showVersions()} versionOpen={versionOpen} closeVersions={() => setVersionOpen(false)}
              restore={restore} /> : null}
            {tab === "details" ? <DetailsSettings form={form} change={change} categories={props.categories}
              authors={props.authors} tags={props.tags} onPickCover={() => setPicker("cover")}
              onCreateTag={addTag} tagName={tagName} setTagName={setTagName} tagError={tagError} /> : null}
            {tab === "seo" ? <SeoSettings form={form} change={change} onPickThumbnail={() => setPicker("thumbnail")} /> : null}
          </div>
        </aside> : null}
      </div>
      {picker !== null ? <MediaPicker scope={{ siteId: props.siteId }}
        value={picker === "cover" ? form.cover_image : picker === "thumbnail" ? form.thumbnail_image : ""}
        onClose={() => setPicker(null)}
        onSelect={(image) => {
          if (picker === "cover") change((previous) => ({ ...previous, cover_image: image.url, cover_alt: image.alt }));
          else if (picker === "thumbnail") change((previous) => ({ ...previous, thumbnail_image: image.url, thumbnail_alt: image.alt }));
          else if (typeof picker === "number") {
            const target = form.draft_content.blocks[picker];
            if (target?.type === "image") updateBlock(picker, { ...target, url: image.url, alt: image.alt });
            else if (target?.type === "gallery") updateBlock(picker, { ...target, images: [...target.images, { url: image.url, alt: image.alt, caption: "" }].slice(0, 20) });
          }
        }} /> : null}
    </main>
    </>
  </EditorSiteContext.Provider>;

  async function navigateAfterSave(href: string) {
    if (busy) return;
    if (dirty) {
      window.clearTimeout(autosaveTimer.current);
      const expectedRevision = revision.current;
      if (!(await persist()) || revision.current !== expectedRevision) return;
    }
    router.push(href);
  }

  function stepPost(by: number) {
    const next = props.adjacentPosts[postIndex + by];
    if (next) void navigateAfterSave(blogManagerHref(props.siteId, props.editorPageId, next.id));
  }
}

function BlogAiPanel({ mode, setMode, topic, setTopic, instruction, setInstruction, tone, setTone,
  selectedText, busy, error, result, categories, onRequest, onApplyDraft, onApplyRewrite,
  onApplySuggestions, onDismiss }: {
  mode: "draft" | "rewrite" | "suggest";
  setMode: (mode: "draft" | "rewrite" | "suggest") => void;
  topic: string; setTopic: (value: string) => void;
  instruction: "improve" | "shorten" | "expand" | "tone"; setInstruction: (value: "improve" | "shorten" | "expand" | "tone") => void;
  tone: string; setTone: (value: string) => void; selectedText: string; busy: boolean; error: string;
  result: BlogAiResult | null; categories: BlogManagerCategory[];
  onRequest: () => void; onApplyDraft: () => void; onApplyRewrite: () => void;
  onApplySuggestions: () => void; onDismiss: () => void;
}) {
  const selectedCategory = result?.mode === "suggest"
    ? categories.find(({ id }) => id === result.category_id)?.name ?? "No category suggestion" : "";
  return <section aria-label="Blog writing assistant" className="mb-8 rounded-2xl border border-[#DCD9FF] bg-white p-5 shadow-sm sm:p-6">
    <header className="flex items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-[#4B3FE0]" />Writing assistant</h2>
        <p className="mt-1 text-xs text-zinc-500">Suggestions use your business information and count toward AI credits.</p></div>
      <button type="button" onClick={onDismiss} aria-label="Close writing assistant" className="rounded p-1 text-zinc-500 hover:bg-zinc-100"><X size={15} /></button>
    </header>
    <div className="mt-4 grid grid-cols-3 rounded-lg bg-zinc-100 p-1 text-xs">
      {(["draft", "rewrite", "suggest"] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)}
        aria-pressed={mode === value} className={`rounded-md px-2 py-2 capitalize ${mode === value ? "bg-white font-semibold shadow-sm" : "text-zinc-600"}`}>
        {value === "suggest" ? "SEO suggestions" : value === "rewrite" ? "Rewrite selection" : "Draft with AI"}
      </button>)}
    </div>
    {mode === "draft" ? <label className="mt-4 block text-sm font-medium">Topic or outline
      <textarea value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={2000} rows={4}
        placeholder="Describe the post you want to write, or paste an outline…" className={`${fieldClass} mt-1 resize-y font-normal`} />
      <span className="mt-1 block text-right text-xs font-normal text-zinc-400">{topic.length}/2000</span>
    </label> : null}
    {mode === "rewrite" ? <div className="mt-4 space-y-3">
      <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected text</p>
        {selectedText ? <p className="whitespace-pre-wrap">{selectedText}</p> : <p className="text-zinc-400">Select text inside a paragraph block first.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Rewrite action<select value={instruction} onChange={(event) => setInstruction(event.target.value as typeof instruction)} className={`${fieldClass} mt-1 font-normal`}>
          <option value="improve">Improve</option><option value="shorten">Shorten</option><option value="expand">Expand</option><option value="tone">Change tone</option>
        </select></label>
        {instruction === "tone" ? <label className="text-xs font-semibold">Desired tone<input value={tone} onChange={(event) => setTone(event.target.value)} maxLength={120} placeholder="e.g. warm and conversational" className={`${fieldClass} mt-1 font-normal`} /></label> : null}
      </div>
    </div> : null}
    {mode === "suggest" ? <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
      Suggestions are previews only. Alt text is based on the description you supplied; the assistant has not seen your images.
    </p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {!result || result.mode !== mode ? <button type="button" disabled={busy || (mode === "draft" && !topic.trim()) || (mode === "rewrite" && !selectedText.trim())}
      onClick={onRequest} className="platform-button platform-button-primary mt-4">
      <Sparkles size={14} />{busy ? "Preparing preview…" : mode === "draft" ? "Generate draft preview" : mode === "rewrite" ? "Preview rewrite" : "Suggest SEO details"}
    </button> : null}
    {result?.mode === "draft" ? <div className="mt-5 rounded-xl border border-[#E8E7E3] bg-[#FBFBFA] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Draft preview · nothing changed yet</p>
      <h3 className="mt-2 text-xl font-semibold">{result.title}</h3>
      {result.subtitle ? <p className="mt-1 text-sm text-zinc-600">{result.subtitle}</p> : null}
      {result.excerpt ? <p className="mt-3 text-sm">{result.excerpt}</p> : null}
      <div className="mt-3 max-h-80 space-y-3 overflow-auto border-t pt-3 text-sm leading-6">
        {result.content.blocks.map((block, index) => block.type === "heading"
          ? <p key={index} className="font-semibold">{block.text}</p>
          : block.type === "paragraph" ? <p key={index}>{textFromHtml(block.html)}</p>
            : block.type === "list" ? <ul key={index} className="list-disc pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
              : null)}
      </div>
      <p className="mt-3 text-xs text-amber-800">Apply replaces the current title, subtitle, excerpt, and body draft.</p>
      <AiNotes notes={result.notes} />
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onApplyDraft} className="platform-button platform-button-primary">Apply draft</button>
        <button type="button" onClick={onRequest} disabled={busy} className="platform-button">Regenerate</button></div>
    </div> : null}
    {result?.mode === "rewrite" ? <div className="mt-5 rounded-xl border border-[#E8E7E3] bg-[#FBFBFA] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Rewrite preview · selected text only</p>
      <blockquote className="mt-3 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-500">{selectedText}</blockquote>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.text}</p>
      <AiNotes notes={result.notes} />
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onApplyRewrite} className="platform-button platform-button-primary">Apply rewrite</button>
        <button type="button" onClick={onRequest} disabled={busy} className="platform-button">Regenerate</button></div>
    </div> : null}
    {result?.mode === "suggest" ? <div className="mt-5 rounded-xl border border-[#E8E7E3] bg-[#FBFBFA] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">SEO preview · nothing changed yet</p>
      <dl className="mt-3 space-y-2 text-sm">
        {[
          ["Title", result.title], ["Subtitle", result.subtitle], ["Excerpt", result.excerpt],
          ["Meta title", result.seo_title], ["Meta description", result.seo_description],
          ["Category", selectedCategory], ["Cover alt text", result.cover_alt],
        ].map(([label, value]) => <div key={label}><dt className="text-[11px] font-semibold text-zinc-500">{label}</dt><dd className="whitespace-pre-wrap">{value || "—"}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-zinc-600">Tags: {result.tag_names.join(", ") || "—"} (new tags will be created when you apply).</p>
      <AiNotes notes={result.notes} />
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onApplySuggestions} className="platform-button platform-button-primary">Apply suggestions</button>
        <button type="button" onClick={onRequest} disabled={busy} className="platform-button">Regenerate</button></div>
    </div> : null}
    <p className="mt-4 text-[11px] leading-5 text-zinc-500">AI does not verify claims or image contents. Review every suggestion and replace unknown facts with verified details before publishing.</p>
  </section>;
}

function AiNotes({ notes }: { notes: string[] }) {
  return notes.length ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
    <p className="font-semibold">Author review</p><ul className="mt-1 list-disc space-y-1 pl-4">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
  </div> : <p className="mt-3 text-xs text-amber-800">Review all factual claims before publishing.</p>;
}

function BlockMenu({ open, onToggle, onAdd, count, compact = false }: {
  open: boolean; onToggle: () => void; onAdd: (block: BlogBlock) => void; count: number; compact?: boolean;
}) {
  const [addingButton, setAddingButton] = useState(false);
  const [text, setText] = useState("");
  const [href, setHref] = useState("");
  const [error, setError] = useState("");
  if (count >= 500) return compact ? null : <p className="mb-3 text-xs text-zinc-500">This post has reached the 500-block limit.</p>;
  function addButton(event: FormEvent) {
    event.preventDefault();
    const parsed = blogButtonSchema.safeParse({ type: "button", text, href });
    if (!parsed.success) { setError("Enter a button label and a safe URL or site path."); return; }
    onAdd(parsed.data);
    setAddingButton(false); setText(""); setHref(""); setError("");
  }
  return <div className={compact ? "mt-2" : "mb-4"}>
    <div className="flex flex-wrap gap-2">
      {!compact ? <>
        <button type="button" className="platform-button" onClick={() => onAdd(freshBlock("paragraph"))}>Add text</button>
        <button type="button" className="platform-button" aria-expanded={open && addingButton} onClick={() => {
          if (!open) onToggle();
          setAddingButton(true);
        }}>Add button</button>
      </> : null}
      <button type="button" onClick={() => { setAddingButton(false); if (!open || !addingButton) onToggle(); }}
        aria-expanded={open && !addingButton} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
        <Plus size={15} />{compact ? "Insert block here" : "More blocks"}
      </button>
    </div>
    {open && (addingButton ? <form onSubmit={addButton} className="mt-2 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Button label<input autoFocus required maxLength={80} value={text} onChange={(event) => setText(event.target.value)} placeholder="Learn more" className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs">Button link<input required maxLength={2048} value={href} onChange={(event) => setHref(event.target.value)} placeholder="/contact or https://…" className={`${fieldClass} mt-1`} /></label>
      </div>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="platform-button platform-button-primary">Insert button</button>
        <button type="button" className="platform-button" onClick={() => { setAddingButton(false); setError(""); }}>Cancel</button>
      </div>
    </form> : <div role="group" aria-label="Insert block" className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-[#E8E7E3] bg-white p-2 sm:grid-cols-4">
      {blockKinds.map((kind) => <button key={kind} type="button" onClick={() => onAdd(freshBlock(kind))}
        className="rounded-lg px-3 py-2 text-left text-sm capitalize hover:bg-zinc-50">{kind === "paragraph" ? "Text" : kind}</button>)}
      <button type="button" onClick={() => setAddingButton(true)} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50">Button</button>
    </div>)}
  </div>;
}

function BlockEditor({ block, index, count, onChange, onMove, onRemove, onChooseImage, onSlash,
  selected, onSelection, onRewrite }: {
  block: BlogBlock; index: number; count: number; onChange: (block: BlogBlock) => void;
  onMove: (by: number) => void; onRemove: () => void; onChooseImage: () => void; onSlash: () => void;
  selected: boolean; onSelection: (selection: BlogTextSelection | null) => void; onRewrite: () => void;
}) {
  return <article className="group relative rounded-xl border border-[#E8E7E3] bg-white p-4 shadow-sm focus-within:border-[#C8C3FF]">
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{block.type}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Move block up" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ArrowUp size={14} /></button>
        <button type="button" aria-label="Move block down" disabled={index === count - 1} onClick={() => onMove(1)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ArrowDown size={14} /></button>
        <button type="button" aria-label="Remove block" onClick={onRemove} className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><X size={14} /></button>
      </div>
    </div>
    {block.type === "paragraph" ? <BlogRichTextEditor html={block.html} selected={selected} onSelection={onSelection}
      onChange={(html) => onChange({ ...block, html })} onRewrite={onRewrite} onSlash={onSlash} /> : null}
    {block.type === "heading" ? <div className="flex gap-2"><select value={block.level} onChange={(event) => onChange({ ...block, level: Number(event.target.value) as 2 | 3 | 4 })} className="rounded border px-2 text-sm">
      <option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option></select>
      <input value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} maxLength={1000} placeholder="Heading text" className="min-w-0 flex-1 text-lg font-semibold outline-none" /></div> : null}
    {block.type === "list" ? <div className="space-y-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.ordered} onChange={(event) => onChange({ ...block, ordered: event.target.checked })} />Numbered list</label>
      <textarea value={block.items.join("\n")} onChange={(event) => onChange({ ...block, items: event.target.value.split("\n").slice(0, 100) })} rows={4} placeholder="One item per line" className={`${fieldClass} resize-y`} /></div> : null}
    {block.type === "quote" ? <div className="space-y-2"><textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} rows={3} placeholder="Quoted text" className={`${fieldClass} resize-y`} />
      <input value={block.attribution} onChange={(event) => onChange({ ...block, attribution: event.target.value })} placeholder="Attribution (optional)" className={fieldClass} /></div> : null}
    {block.type === "callout" ? <div className="space-y-2"><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} placeholder="Callout title" className={fieldClass} />
      <textarea value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} rows={3} placeholder="Callout text" className={`${fieldClass} resize-y`} /></div> : null}
    {block.type === "image" ? <div>
      {block.url ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.alt} className="mb-3 max-h-80 w-full rounded-lg object-cover" />
      </> : <p className="mb-3 rounded-lg bg-zinc-50 p-8 text-center text-sm text-zinc-400">Choose an image from the media library.</p>}
      <button type="button" onClick={onChooseImage} className="platform-button"><ImagePlus size={14} />{block.url ? "Replace image" : "Choose image"}</button>
      <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} maxLength={500} placeholder="Alt text" className={`${fieldClass} mt-2`} />
      <input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} maxLength={500} placeholder="Caption" className={`${fieldClass} mt-2`} />
    </div> : null}
    {block.type === "gallery" ? <div><div className="grid grid-cols-3 gap-2">
      {block.images.map((item, at) => <div key={`${item.url}-${at}`} className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.alt} className="aspect-square w-full rounded-lg object-cover" />
        <button type="button" onClick={() => onChange({ ...block, images: block.images.filter((_, i) => i !== at) })}
          aria-label={`Remove image ${at + 1}`} className="absolute right-1 top-1 rounded-full bg-white p-1 text-zinc-700"><X size={12} /></button>
      </div>)}
      </div><button type="button" disabled={block.images.length >= 20} onClick={onChooseImage} className="platform-button mt-3"><ImagePlus size={14} />Add image</button></div> : null}
    {block.type === "video" ? <div className="space-y-2"><input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} placeholder="YouTube or Vimeo URL" className={fieldClass} />
      <input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} placeholder="Video title" className={fieldClass} /></div> : null}
    {block.type === "button" ? <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Button label<input maxLength={80} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} className={`${fieldClass} mt-1`} /></label>
      <label className="text-xs">Button link<input maxLength={2048} value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value })} className={`${fieldClass} mt-1`} /></label>
    </div> : null}
    {block.type === "divider" ? <hr className="border-zinc-200" /> : null}
    {block.type === "table" ? <div><p className="mb-2 text-xs text-zinc-500">One row per line; separate cells with |.</p>
      <textarea value={block.rows.map((row) => row.join(" | ")).join("\n")} onChange={(event) => onChange({
        ...block, rows: event.target.value.split("\n").slice(0, 30).map((row) => row.split("|").map((cell) => cell.trim()).slice(0, 8)),
      })} rows={5} className={`${fieldClass} resize-y font-mono`} /></div> : null}
  </article>;
}

function StatusSettings({ status, publishedAt, hasUnpublishedChanges, hasScheduledSnapshot, slug, slugMessage, onSlug, timezone,
  scheduleTime, setScheduleTime, utcSchedule, scheduleError, busy, versions, onChangeStatus, onVersions,
  versionOpen, closeVersions, restore }: {
  status: Props["status"]; publishedAt: string | null; hasUnpublishedChanges: boolean;
  hasScheduledSnapshot: boolean;
  slug: string; slugMessage: string; onSlug: (slug: string) => void; timezone: string;
  scheduleTime: string; setScheduleTime: (value: string) => void; utcSchedule: string | null; scheduleError: string;
  busy: boolean; versions: Version[]; onChangeStatus: (status: "draft" | "scheduled" | "published") => void;
  onVersions: () => void; versionOpen: boolean; closeVersions: () => void; restore: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(slug); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  }
  return <div className="space-y-5 py-5">
    <section><label className="block text-xs font-semibold">URL slug
      <div className="mt-1 flex gap-2"><input value={slug} readOnly={hasScheduledSnapshot} onChange={(event) => onSlug(event.target.value)} className={`${fieldClass} min-w-0`} />
        <button type="button" onClick={() => void copy()} aria-label="Copy post slug" className="rounded-lg border px-3"><Copy size={14} /></button></div>
    </label><p className={`mt-1 text-[11px] ${slugMessage ? "text-red-700" : "text-zinc-500"}`}>{slugMessage || (copied ? "Copied" :
      hasScheduledSnapshot ? "Cancel the schedule to change the URL." : "Nested slugs are supported.")}</p></section>
    <section className="rounded-xl bg-[#F8F8F6] p-3">
      <p className="text-xs font-semibold">Status</p>
      <p className="mt-1 text-sm capitalize">{status}{status === "published" && hasUnpublishedChanges ? " · Changes not published" : ""}</p>
      {publishedAt ? <p className="mt-1 text-xs text-zinc-500">Published {new Date(publishedAt).toLocaleString(undefined, { timeZone: timezone, timeZoneName: "short" })}</p> : null}
    </section>
    <section><label className="block text-xs font-semibold">Schedule date and time ({timezone})
      <input type="datetime-local" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className={`${fieldClass} mt-1`} />
    </label>
      <p className="mt-1 text-[11px] text-zinc-500">UTC: {utcSchedule ? new Date(utcSchedule).toISOString() : "Choose a valid local date and time."}</p>
      {status === "scheduled" && !hasScheduledSnapshot ? <p className="mt-1 text-xs text-amber-800">This older schedule needs a new date and time before it can publish automatically.</p> : null}
      {hasScheduledSnapshot ? <p className="mt-1 text-xs text-zinc-500">
        {hasUnpublishedChanges ? "Draft changes are not part of the schedule. Reschedule to include them." : "This version will publish automatically. Later edits stay in the draft."}
      </p> : null}
      {status === "published" ? <p className="mt-1 text-xs text-zinc-500">Scheduling takes the post offline until the scheduled time.</p> : null}
      {scheduleError ? <p role="alert" className="mt-1 text-xs text-red-700">{scheduleError}</p> : null}
      <button type="button" disabled={busy} onClick={() => onChangeStatus("scheduled")} className="platform-button mt-2 w-full">{status === "scheduled" ? "Reschedule" : "Schedule"}</button>
    </section>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={busy || status === "draft"} onClick={() => onChangeStatus("draft")} className="platform-button">{status === "scheduled" ? "Cancel schedule" : "Unpublish"}</button>
      <button type="button" disabled={busy || (status === "published" && !hasUnpublishedChanges)} onClick={() => onChangeStatus("published")} className="platform-button platform-button-primary">
        {status === "published" ? hasUnpublishedChanges ? "Republish" : "Published" : "Publish now"}
      </button>
    </div>
    <section className="border-t border-[#E8E7E3] pt-4">
      <button type="button" onClick={onVersions} className="platform-button w-full"><RotateCcw size={14} />Revision history</button>
      {versionOpen ? <div className="mt-3 rounded-xl border p-3">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold">Previous drafts</p><button type="button" onClick={closeVersions} aria-label="Close revision history"><X size={13} /></button></div>
        {versions.length ? versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-2 border-t py-2 text-xs">
          <time>{new Date(version.created_at).toLocaleString(undefined, { timeZone: timezone, timeZoneName: "short" })}</time><button type="button" onClick={() => restore(version.id)} className="text-[#4B3FE0] underline">Restore</button>
        </div>) : <p className="text-xs text-zinc-500">No saved revisions yet.</p>}
      </div> : null}
    </section>
  </div>;
}

function DetailsSettings({ form, change, categories, authors, tags, onPickCover, onCreateTag, tagName, setTagName, tagError }: {
  form: BlogPostFields; change: (update: (previous: BlogPostFields) => BlogPostFields) => void;
  categories: BlogManagerCategory[]; authors: BlogManagerAuthor[]; tags: BlogManagerTag[];
  onPickCover: () => void; onCreateTag: (event: FormEvent) => void;
  tagName: string; setTagName: (value: string) => void; tagError: string;
}) {
  return <div className="space-y-4 py-5">
    <label className="block text-xs font-semibold">Subtitle<input value={form.subtitle} maxLength={300} onChange={(event) => change((old) => ({ ...old, subtitle: event.target.value }))} className={`${fieldClass} mt-1 font-normal`} /></label>
    <label className="block text-xs font-semibold">Author<select value={form.author_id ?? ""} onChange={(event) => change((old) => ({ ...old, author_id: event.target.value || null }))} className={`${fieldClass} mt-1 font-normal`}>
      <option value="">No author</option>{authors.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label className="block text-xs font-semibold">Category<select value={form.category_id ?? ""} onChange={(event) => change((old) => ({ ...old, category_id: event.target.value || null }))} className={`${fieldClass} mt-1 font-normal`}>
      <option value="">No category</option>{categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <section><p className="text-xs font-semibold">Main image</p>
      {form.cover_image ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={form.cover_image} alt={form.cover_alt} className="mt-2 aspect-video w-full rounded-lg object-cover" />
      </> : null}
      <button type="button" onClick={onPickCover} className="platform-button mt-2 w-full"><ImagePlus size={14} />{form.cover_image ? "Replace image" : "Choose image"}</button>
      <label className="mt-2 block text-xs">Alt text<input value={form.cover_alt} onChange={(event) => change((old) => ({ ...old, cover_alt: event.target.value }))} maxLength={500} className={`${fieldClass} mt-1 font-normal`} /></label>
    </section>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured} onChange={(event) => change((old) => ({ ...old, featured: event.target.checked }))} />Featured post</label>
    <label className="block text-xs font-semibold">Post layout<select value={form.layout_override ?? ""} onChange={(event) => change((old) => ({ ...old, layout_override: (event.target.value || null) as BlogPostFields["layout_override"] }))} className={`${fieldClass} mt-1 font-normal`}>
      <option value="">Use blog default</option><option value="classic">Classic</option><option value="wide">Wide</option><option value="minimal">Minimal</option>
    </select></label>
    <section className="border-t border-[#E8E7E3] pt-4"><p className="text-xs font-semibold">Tags</p>
      <div className="mt-2 max-h-40 space-y-2 overflow-auto">{tags.map(({ id, name }) => <label key={id} className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={form.tag_ids.includes(id)} onChange={(event) => change((old) => ({ ...old, tag_ids: event.target.checked ? [...old.tag_ids, id] : old.tag_ids.filter((tagId) => tagId !== id) }))} />{name}
      </label>)}</div>
      <form onSubmit={onCreateTag} className="mt-3 flex gap-2"><input value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={80} placeholder="Create tag" className={`${fieldClass} min-w-0`} />
        <button type="submit" className="platform-button"><Plus size={14} />Add</button></form>
      {tagError ? <p role="alert" className="mt-1 text-xs text-red-700">{tagError}</p> : null}
    </section>
  </div>;
}

function SeoSettings({ form, change, onPickThumbnail }: {
  form: BlogPostFields; change: (update: (previous: BlogPostFields) => BlogPostFields) => void; onPickThumbnail: () => void;
}) {
  const thumbnail = form.thumbnail_image || form.cover_image;
  return <div className="space-y-4 py-5">
    <label className="block text-xs font-semibold">Meta title
      <input value={form.seo_title} onChange={(event) => change((old) => ({ ...old, seo_title: event.target.value }))} maxLength={200} className={`${fieldClass} mt-1 font-normal`} />
      <span className={`mt-1 block text-right font-normal ${form.seo_title.length > 60 ? "text-amber-700" : "text-zinc-500"}`}>
        {form.seo_title.length}/60 ideal{form.seo_title.length > 60 ? " · longer than recommended" : ""}
      </span>
    </label>
    <label className="block text-xs font-semibold">Meta description
      <textarea value={form.seo_description} onChange={(event) => change((old) => ({ ...old, seo_description: event.target.value }))} maxLength={500} rows={3} className={`${fieldClass} mt-1 font-normal`} />
      <span className={`mt-1 block text-right font-normal ${form.seo_description.length > 0 && (form.seo_description.length < 140 || form.seo_description.length > 160) ? "text-amber-700" : "text-zinc-500"}`}>
        {form.seo_description.length}/160 ideal{form.seo_description.length > 0 && (form.seo_description.length < 140 || form.seo_description.length > 160) ? " · outside recommended range" : ""}
      </span>
    </label>
    <section><p className="text-xs font-semibold">Social image</p>
      {thumbnail ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail} alt={form.thumbnail_alt || form.cover_alt} className="mt-2 aspect-video w-full rounded-lg object-cover" />
      </> : null}
      <button type="button" onClick={onPickThumbnail} className="platform-button mt-2 w-full"><ImagePlus size={14} />{form.thumbnail_image ? "Replace image" : "Use or replace main image"}</button>
      <label className="mt-2 block text-xs">Alt text<input value={form.thumbnail_alt} onChange={(event) => change((old) => ({ ...old, thumbnail_alt: event.target.value }))} maxLength={500} className={`${fieldClass} mt-1 font-normal`} /></label>
    </section>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.noindex} onChange={(event) => change((old) => ({ ...old, noindex: event.target.checked }))} />Ask search engines not to index</label>
    <details><summary className="cursor-pointer text-xs font-semibold">Advanced canonical URL</summary>
      <input value={form.canonical_url} onChange={(event) => change((old) => ({ ...old, canonical_url: event.target.value }))} maxLength={2048} placeholder="https://…" className={`${fieldClass} mt-2 font-normal`} />
    </details>
    <div className="rounded-xl border border-[#E8E7E3] bg-[#F8F8F6] p-3">
      <p className="text-xs font-semibold">Search preview</p>
      <p className="mt-2 truncate text-sm text-[#1a0dab]">{form.seo_title || form.title || "Post title"}</p>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{form.seo_description || form.excerpt || "Your post description will appear here."}</p>
      <p className="mt-2 text-[11px] text-zinc-500">Schema markup and Open Graph tags are generated automatically.</p>
    </div>
    <div className="overflow-hidden rounded-xl border border-[#E8E7E3] bg-white">
      {thumbnail ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail} alt="" className="aspect-[1.91/1] w-full object-cover" />
      </> : null}
      <div className="p-3"><p className="text-[11px] text-zinc-500">Social preview</p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold">{form.seo_title || form.title || "Post title"}</p>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{form.seo_description || form.excerpt || "Your post description will appear here."}</p>
      </div>
    </div>
  </div>;
}

function PostPreview({ form }: { form: BlogPostFields }) {
  const content = blogContentSchema.safeParse(form.draft_content);
  if (!content.success) return <p role="alert" className="text-sm text-red-700">This draft cannot be previewed because its content is invalid.</p>;
  return <article className="prose mx-auto max-w-[70ch]">
    {form.cover_image ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={form.cover_image} alt={form.cover_alt} className="mb-8 aspect-[16/9] w-full rounded-2xl object-cover" />
    </> : null}
    <h1 className="text-4xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{form.title}</h1>
    {form.subtitle ? <p className="mt-4 text-xl text-zinc-500">{form.subtitle}</p> : null}
    <div className="mt-10 space-y-6 text-base leading-8">
      {content.data.blocks.map((block, index) => <PreviewBlock key={`${index}-${block.type}`} block={block} />)}
    </div>
  </article>;
}

function PreviewBlock({ block }: { block: BlogBlock }) {
  if (block.type === "paragraph") return <RichTextContent value={block.html} />;
  if (block.type === "heading") {
    const Tag = `h${block.level}` as "h2" | "h3" | "h4";
    return <Tag className="font-semibold">{block.text}</Tag>;
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag className={block.ordered ? "list-decimal pl-6" : "list-disc pl-6"}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</Tag>;
  }
  if (block.type === "quote") return <blockquote className="border-l-4 border-zinc-300 pl-5 italic">{block.text}<footer className="mt-2 text-sm not-italic text-zinc-500">{block.attribution}</footer></blockquote>;
  if (block.type === "callout") return <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-5"><strong>{block.title}</strong><p>{block.text}</p></aside>;
  if (block.type === "image") return block.url ? <figure>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={block.url} alt={block.alt} className="w-full rounded-xl" />{block.caption ? <figcaption className="mt-2 text-center text-sm text-zinc-500">{block.caption}</figcaption> : null}
  </figure> : null;
  if (block.type === "gallery") return <div className="grid grid-cols-2 gap-3">{block.images.map((image, i) => <div key={i}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} alt={image.alt} className="rounded-xl" />
  </div>)}</div>;
  if (block.type === "video") return <p className="rounded-xl bg-zinc-100 p-5 text-sm">Video: {block.title || block.url}</p>;
  if (block.type === "button") {
    const button = blogButtonSchema.safeParse(block);
    return button.success ? <a href={button.data.href} className="inline-flex rounded-lg bg-[var(--color-primary,#4B3FE0)] px-5 py-3 text-sm font-medium text-white">{button.data.text}</a> : null;
  }
  if (block.type === "divider") return <hr />;
  if (block.type === "table") return <table className="w-full border-collapse">{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border p-2">{cell}</td>)}</tr>)}</table>;
  return null;
}
