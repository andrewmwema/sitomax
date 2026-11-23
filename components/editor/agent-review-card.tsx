"use client";

import { useEffect, useMemo, useRef } from "react";
import { Render, type Data } from "@puckeditor/core";
import { Check, Eye, RotateCcw, Sparkles } from "lucide-react";
import { z } from "zod";
import {
  footerChanges,
  previewAgentReview,
  type AgentReviewDecision,
  type AgentReviewPayload,
} from "@/lib/ai/agent-review";
import { editorHeader, headerSchema } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";

export type AgentReviewState = AgentReviewPayload & {
  decisions: Record<string, AgentReviewDecision>;
  activeChangeId: string | null;
  comparison: "before" | "after";
};

export function newAgentReview(payload: AgentReviewPayload): AgentReviewState {
  return { ...payload, decisions: {}, activeChangeId: null, comparison: "after" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pageFor(snapshot: AgentReviewPayload["working"], pageId: string) {
  return snapshot.pages.find((page) => isRecord(page) && page.id === pageId);
}

function pageName(page: unknown) {
  if (!isRecord(page)) return "Page";
  if (typeof page.title === "string" && page.title.trim()) return page.title;
  if (typeof page.slug === "string" && page.slug) return page.slug.replaceAll("/", " / ");
  return "Home";
}

function groupFor(change: AgentReviewPayload["changes"][number], review: AgentReviewState) {
  if (change.kind === "theme") return { key: "theme", label: "Theme" };
  if (change.kind === "header") return { key: "header", label: "Header" };
  if (change.kind === "footer") return { key: "footer", label: "Footer" };
  if (change.kind.startsWith("create_blog") || change.kind.startsWith("update_blog")) {
    return { key: "blog", label: "Blog" };
  }
  const page = change.pageId
    ? pageFor(review.working, change.pageId) ?? pageFor(review.baseline, change.pageId)
    : null;
  return {
    key: `page:${change.pageId ?? "site"}`,
    label: page ? pageName(page) : "Site",
  };
}

function isBlogChange(kind: string) {
  return kind === "create_blog_post" || kind === "update_blog_post";
}

const previewSectionSchema = z.looseObject({
  type: z.string(),
  props: z.looseObject({ id: z.string().min(1) }),
});
const previewDataSchema = z.looseObject({
  content: z.array(previewSectionSchema).default([]),
  root: z.looseObject({
    props: z.looseObject({ title: z.string().optional() }).optional(),
  }).default({}),
  zones: z.record(z.string(), z.array(previewSectionSchema)).optional(),
});

function reviewData(snapshot: AgentReviewPayload["working"], pageId: string, baselineFooter: unknown): Data | null {
  const page = pageFor(snapshot, pageId);
  if (!isRecord(page) || !isRecord(page.draft_data)) return null;
  const parsed = previewDataSchema.safeParse(page.draft_data);
  const header = headerSchema.safeParse(snapshot.header);
  if (!parsed.success || !header.success) return null;
  const raw = parsed.data;
  const content: Data["content"] = raw.content.filter((item) => item.type !== "Navigation");
  // Shows what applying does: changed footer fields land on every page that has a footer.
  const footer = footerChanges(baselineFooter, snapshot.footer);
  const index = content.findIndex((item) => item.type === "Footer");
  if (index >= 0 && Object.keys(footer).length) {
    content[index] = { ...content[index], props: { ...content[index].props, ...footer } };
  }
  const rootProps = { ...raw.root.props, __editorHeader: header.data };
  return {
    ...raw,
    content,
    root: { ...raw.root, props: rootProps },
  };
}

function sectionIds(data: Data | null) {
  return new Set((data?.content ?? []).flatMap((item) =>
    typeof item.props.id === "string" ? [item.props.id] : []));
}

function changedSectionIds(before: Data | null, after: Data | null) {
  const oldContent = before?.content ?? [];
  const newContent = after?.content ?? [];
  const ids = new Set<string>();
  const oldIndexes = new Map(oldContent.map((item, index) => [item.props.id, index]));
  const newIndexes = new Map(newContent.map((item, index) => [item.props.id, index]));
  for (const id of new Set([...oldIndexes.keys(), ...newIndexes.keys()])) {
    const oldIndex = oldIndexes.get(id);
    const newIndex = newIndexes.get(id);
    if (oldIndex !== newIndex || JSON.stringify(oldContent[oldIndex ?? -1]) !== JSON.stringify(newContent[newIndex ?? -1])) {
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

function renderedSections(container: HTMLElement, data: Data | null) {
  const dropZone = container.querySelector("main")?.firstElementChild;
  if (!dropZone || !data) return [];
  const items = data.content.filter((item) => item.type in puckConfig.components);
  return items.flatMap((item, index) => {
    const id = item.props.id;
    const element = dropZone.children.item(index);
    return typeof id === "string" && element ? [{ id, element }] : [];
  });
}

export function AgentReviewCard({ review, onChange, currentPageId, onApply, applying, disabled }: {
  review: AgentReviewState;
  onChange: (next: AgentReviewState) => void;
  currentPageId: string;
  onApply: () => void;
  applying: boolean;
  disabled: boolean;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, { label: string; changes: AgentReviewPayload["changes"] }>();
    for (const change of review.changes) {
      const group = groupFor(change, review);
      const entry = result.get(group.key) ?? { label: group.label, changes: [] };
      entry.changes.push(change);
      result.set(group.key, entry);
    }
    return [...result.values()];
  }, [review]);
  const pageCount = new Set(review.changes.flatMap((change) => change.pageId ? [change.pageId] : [])).size;
  const keptCount = review.changes.filter((change) => review.decisions[change.id] !== "undone").length;

  if (!review.changes.length) return null;

  function decide(decision: AgentReviewDecision) {
    onChange({
      ...review,
      decisions: Object.fromEntries(review.changes.map((change) => [change.id, decision])),
    });
  }

  function selectChange(changeId: string, comparison: "before" | "after" = "after") {
    onChange({ ...review, activeChangeId: changeId, comparison });
  }

  return <section className="rounded-xl border border-violet-200 bg-white shadow-sm" aria-label="Review AI changes">
    <header className="border-b border-violet-100 bg-violet-50 px-3 py-3">
      <div className="flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-violet-700" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-violet-950">
            {review.changes.length} {review.changes.length === 1 ? "change" : "changes"}
            {pageCount ? ` on ${pageCount} ${pageCount === 1 ? "page" : "pages"}` : ""}
          </h3>
          <p className="mt-1 text-[10px] text-violet-800">Preview only · changes have not been saved</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-lg bg-violet-700 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-violet-800"
          onClick={() => decide("kept")}><Check size={12} className="mr-1 inline" />Keep all</button>
        <button type="button" className="rounded-lg border border-violet-200 px-3 py-1.5 text-[11px] text-violet-800 hover:bg-white"
          onClick={() => decide("undone")}><RotateCcw size={12} className="mr-1 inline" />Undo all</button>
      </div>
    </header>
    {review.quality ? <section className="border-b border-violet-100 px-3 py-2 text-[11px] leading-relaxed" aria-label="Quality check">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quality check</h4>
      {!review.quality.fixed.length && !review.quality.notes.length
        ? <p className="mt-1 text-green-800">No new contrast, link, menu or placeholder problems found.</p> : null}
      {review.quality.fixed.length ? <>
        <p className="mt-1 font-medium text-green-800">Fixed automatically</p>
        <ul className="list-disc pl-4 text-zinc-700">{review.quality.fixed.map((item) => <li key={item}>{item}</li>)}</ul>
      </> : null}
      {review.quality.notes.length ? <>
        <p className="mt-1 font-medium text-amber-800">Check before publishing</p>
        <ul className="list-disc pl-4 text-zinc-700">{review.quality.notes.map((item) => <li key={item}>{item}</li>)}</ul>
      </> : null}
    </section> : null}
    <div className="max-h-80 space-y-3 overflow-y-auto p-3">
      {groups.map((group) => <section key={group.label}>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group.label}</h4>
        <ul className="space-y-2">
          {group.changes.map((change) => {
            const decision = review.decisions[change.id];
            const selected = review.activeChangeId === change.id;
            const previewable = !isBlogChange(change.kind) &&
              Boolean(change.pageId || ["theme", "header", "footer"].includes(change.kind));
            const page = change.pageId ? pageFor(review.working, change.pageId) ?? pageFor(review.baseline, change.pageId) : null;
            return <li key={change.id} className={`rounded-lg border p-2 ${selected ? "border-violet-300 bg-violet-50/60" : "border-zinc-100"}`}>
              <button type="button" className="block w-full text-left text-[11px] font-medium text-zinc-800"
                onClick={() => selectChange(change.id)}>
                {change.label}
              </button>
              {change.pageId && change.pageId !== currentPageId ? <button type="button"
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-violet-700 hover:underline"
                onClick={() => selectChange(change.id)}><Eye size={11} />Preview {pageName(page)}</button> : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`mr-auto text-[10px] ${decision === "kept" ? "text-green-700" : decision === "undone" ? "text-zinc-400" : "text-amber-700"}`}>
                  {decision === "kept" ? "Kept" : decision === "undone" ? "Undone" : "Pending"}
                </span>
                <button type="button" aria-label={`Keep ${change.label}`} aria-pressed={decision === "kept"}
                  onClick={() => onChange({ ...review, decisions: { ...review.decisions, [change.id]: "kept" } })}
                  className="rounded border border-green-200 px-2 py-1 text-[10px] text-green-800 hover:bg-green-50">Keep</button>
                <button type="button" aria-label={`Undo ${change.label}`} aria-pressed={decision === "undone"}
                  onClick={() => onChange({ ...review, decisions: { ...review.decisions, [change.id]: "undone" } })}
                  className="rounded border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50">Undo</button>
                {previewable ? <>
                  <button type="button" aria-label={`Preview ${change.label} before`}
                    aria-pressed={selected && review.comparison === "before"}
                    onClick={() => selectChange(change.id, "before")}
                    className="rounded border border-violet-200 px-2 py-1 text-[10px] text-violet-800 hover:bg-violet-50">Before</button>
                  <button type="button" aria-label={`Preview ${change.label} after`}
                    aria-pressed={selected && review.comparison === "after"}
                    onClick={() => selectChange(change.id, "after")}
                    className="rounded border border-violet-200 px-2 py-1 text-[10px] text-violet-800 hover:bg-violet-50">After</button>
                </> : null}
              </div>
            </li>;
          })}
        </ul>
      </section>)}
    </div>
    <footer className="border-t border-violet-100 p-3">
      <button type="button" disabled={disabled || keptCount === 0} onClick={onApply}
        className="w-full rounded-lg bg-violet-700 px-3 py-2 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50">
        {applying ? "Applying..." : `Apply ${keptCount} ${keptCount === 1 ? "change" : "changes"} to drafts`}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        Saved to drafts in one step that you can undo from here or History. Changes to content you edited since are skipped and listed. Nothing is published.
      </p>
    </footer>
  </section>;
}

export function AgentReviewCanvas({ review, pageId, metadata }: {
  review: AgentReviewState;
  pageId: string;
  metadata?: Record<string, unknown>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const selectedIndex = review.changes.findIndex((change) => change.id === review.activeChangeId);
  const selectedChange = selectedIndex >= 0 ? review.changes[selectedIndex] : null;
  const activeChange = selectedChange && !isBlogChange(selectedChange.kind) ? selectedChange : null;
  const activeIndex = activeChange ? selectedIndex : -1;
  const targetPageId = activeChange?.pageId ?? pageId;
  const before = activeChange
    ? previewAgentReview(review, review.decisions, activeIndex - 1)
    : previewAgentReview(review, {}, -1);
  const after = activeChange
    ? previewAgentReview(review, review.decisions, activeIndex)
    : previewAgentReview(review, review.decisions);
  const selected = review.comparison === "before" ? before : after;
  const selectedPage = selected.snapshot ? pageFor(selected.snapshot, targetPageId) : null;
  const preview = selected.snapshot ? reviewData(selected.snapshot, targetPageId, review.baseline.footer) : null;
  const beforePage = before.snapshot ? reviewData(before.snapshot, targetPageId, review.baseline.footer) : null;
  const afterPage = after.snapshot ? reviewData(after.snapshot, targetPageId, review.baseline.footer) : null;
  const changedIds = changedSectionIds(beforePage, afterPage);
  if (activeChange?.kind === "theme" || (!activeChange && JSON.stringify(review.baseline.theme) !== JSON.stringify(review.working.theme))) {
    for (const id of sectionIds(preview)) changedIds.add(id);
  }
  const changedKey = [...changedIds].sort().join("|");
  const title = pageName(selectedPage);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const ids = new Set(changedKey.split("|").filter(Boolean));
    for (const element of root.querySelectorAll("[data-ai-review-changed]")) element.removeAttribute("data-ai-review-changed");
    for (const section of renderedSections(root, preview)) {
      if (ids.has(section.id)) section.element.setAttribute("data-ai-review-changed", "true");
    }
  }, [changedKey, preview]);

  useEffect(() => {
    if (!activeChange || activeChange.pageId !== targetPageId || !container.current || !preview) return;
    const target = renderedSections(container.current, preview).find((section) => changedIds.has(section.id));
    target?.element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeChange, changedKey, changedIds, preview, targetPageId]);

  return <div ref={container} data-ai-review-preview inert className="agent-review-canvas-preview">
    <div className="agent-review-canvas-label" aria-live="polite">
      <Sparkles size={13} />Previewing {title} · not saved
      {activeChange ? <span className="ml-auto">{review.comparison === "before" ? "Before" : "After"}</span> : null}
    </div>
    {selected.error ? <p role="status" className="agent-review-canvas-error">{selected.error}</p>
      : preview ? <Render config={puckConfig} data={preview}
        metadata={{ ...metadata, theme: selected.snapshot?.theme, siteHeader: editorHeader(preview) }} />
        : <p className="agent-review-canvas-error">{selectedPage
          ? "This page contains invalid preview data and cannot be displayed."
          : "This page does not exist in this comparison."}</p>}
  </div>;
}
