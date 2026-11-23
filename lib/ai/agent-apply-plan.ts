import { menuLabelSchema } from "@/lib/page-navigation";
import { slugError } from "@/lib/page-slugs";
import { applyReviewPatches, footerChanges, jsonEqual, type AgentReviewChange } from "./agent-review";

type Json = Record<string, unknown>;
type PageState = {
  id: string; slug: string; title: string | null; nav_label?: string | null; hide_from_menu?: boolean;
  draft_data: unknown; seo: unknown; sort_order: number;
};
type PostState = { id: string; title: string } & Json;
export type ApplySiteState = { theme: unknown; header: unknown; footer: unknown; pages: PageState[]; posts: PostState[] };

/** Current database facts the normalized snapshot does not carry. */
export type ApplyMeta = {
  draftHeader: unknown;
  pages: Record<string, { draftVersion: string; published: boolean; rawDraft: unknown }>;
  posts: Record<string, { updatedAt: string }>;
};

const PAGE_SETTINGS = ["title", "nav_label", "hide_from_menu", "seo"] as const;
const POST_FIELDS = ["title", "subtitle", "excerpt", "slug", "draft_content", "seo_title", "seo_description", "cover_alt"] as const;

export type ApplyItem = { key: string; label: string } & (
  | { kind: "theme" | "header"; expected: unknown; after: unknown }
  | { kind: "page"; target_id: string; expected_version: string; draft_data: unknown; settings?: Json }
  | { kind: "page_created"; target_id: string; draft_data: unknown; settings: Json }
  | { kind: "post"; target_id: string; expected_updated_at: string; fields: Json }
  | { kind: "post_created"; target_id: string; fields: Json }
);
export type ApplyPlan = {
  items: ApplyItem[];
  /** Applied changes and the items each one touched. */
  changes: { id: string; label: string; items: string[] }[];
  dropped: { id: string; label: string; reason: string }[];
  notes: string[];
};

const CONFLICT = "This content was edited after the AI prepared the change, or it depends on a change you undid.";
const SETTINGS = "#settings";
const LIVE_SETTINGS = "This only affects settings that are already live on a published page. Change them in Pages.";
const NO_EFFECT = "This change no longer affects any draft.";

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function pick(source: Json, keys: readonly string[]): Json {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}
function pageLabel(page: PageState) {
  return page.title?.trim() || (page.slug ? page.slug.replaceAll("/", " / ") : "Home");
}
function content(draft: unknown): Json[] {
  return isRecord(draft) && Array.isArray(draft.content) ? draft.content.filter(isRecord) : [];
}
/** Keeps draft keys the agent snapshot does not model, such as read-only flags. */
function mergeDraft(raw: unknown, next: unknown) {
  if (!isRecord(raw) || !isRecord(next)) return next;
  return { ...raw, ...next, root: { ...(isRecord(raw.root) ? raw.root : {}), ...(isRecord(next.root) ? next.root : {}) } };
}
function ids(items: unknown) {
  return Array.isArray(items) ? items.flatMap((item) => isRecord(item) && typeof item.id === "string" ? [item.id] : []) : [];
}
function touchedKeys(change: AgentReviewChange) {
  const keys = new Set<string>();
  for (const patch of change.patches) {
    const [head, target] = patch.path;
    if (head === "theme" || head === "header" || head === "footer") keys.add(head);
    if (head !== "pages" && head !== "posts") continue;
    const prefix = head === "pages" ? "page" : "post";
    // Page settings are tracked apart from the draft: they are not written for published pages.
    const facet = head === "pages" && (PAGE_SETTINGS as readonly unknown[]).includes(patch.path[2]) ? SETTINGS : "";
    if (typeof target === "object") keys.add(`${prefix}:${target.id}${facet}`);
    else if ("order" in patch) for (const id of [...Object.keys(patch.added), ...Object.keys(patch.removed)]) keys.add(`${prefix}:${id}`);
    else {
      // Whole-list replacement from runs staged before keyed list patches: attribute the added and removed entries.
      const before = ids(patch.before.present ? patch.before.value : []);
      const after = ids(patch.after.present ? patch.after.value : []);
      const changed = [...before.filter((id) => !after.includes(id)), ...after.filter((id) => !before.includes(id))];
      for (const id of changed.length ? changed : after) keys.add(`${prefix}:${id}`);
    }
  }
  return keys;
}

/**
 * Page settings the database or the site's routing would reject. Only checked
 * where they will be written: new pages and pages that were never published.
 */
function settingsIssue(keys: Set<string>, state: ApplySiteState, current: Map<string, PageState>, meta: ApplyMeta) {
  for (const key of keys) {
    if (!key.startsWith("page:")) continue;
    const id = key.slice(5).replace(SETTINGS, "");
    const page = state.pages.find((entry) => entry.id === id);
    const existing = current.get(id);
    if (!page || (existing && meta.pages[id]?.published)) continue;
    const address = existing ? null : slugError(page.slug);
    if (address) return `The page address cannot be used: ${address}`;
    if ((!existing || existing.nav_label !== page.nav_label) && menuLabelSchema.safeParse(page.nav_label).data !== page.nav_label) {
      return "The menu label must be 1 to 40 characters and at most three words.";
    }
  }
  return null;
}

/**
 * Rebases the kept changes onto the current drafts. A change whose guarded
 * values no longer match is dropped whole, so manual edits are never overwritten.
 */
export function planAgentApply(
  current: ApplySiteState, meta: ApplyMeta, changes: AgentReviewChange[], undone: ReadonlySet<string>,
): ApplyPlan {
  let state = structuredClone(current);
  const pages = new Map(current.pages.map((page) => [page.id, page]));
  const kept: { change: AgentReviewChange; keys: Set<string> }[] = [];
  const dropped: ApplyPlan["dropped"] = [];
  for (const change of changes) {
    if (undone.has(change.id)) continue;
    let next: ApplySiteState;
    try {
      next = applyReviewPatches(state, change.patches);
    } catch {
      dropped.push({ id: change.id, label: change.label, reason: CONFLICT });
      continue;
    }
    const keys = touchedKeys(change);
    const issue = settingsIssue(keys, next, pages, meta);
    if (issue) dropped.push({ id: change.id, label: change.label, reason: issue });
    else { state = next; kept.push({ change, keys }); }
  }

  // The footer is one shared block repeated on every page that shows it.
  const footer = footerChanges(current.footer, state.footer);
  const footerPages = new Set<string>();
  if (Object.keys(footer).length) {
    for (const page of state.pages) {
      if (!isRecord(page.draft_data)) continue;
      const blocks = content(page.draft_data);
      if (!blocks.some((item) => item.type === "Footer")) continue;
      footerPages.add(`page:${page.id}`);
      page.draft_data = { ...page.draft_data, content: blocks.map((item) => item.type === "Footer"
        ? { ...item, props: { ...(isRecord(item.props) ? item.props : {}), ...footer } } : item) };
    }
  }

  const items: ApplyItem[] = [];
  const notes: string[] = [];
  if (!jsonEqual(current.theme, state.theme)) {
    items.push({ kind: "theme", key: "theme", label: "Site theme", expected: current.theme, after: state.theme });
  }
  if (!jsonEqual(current.header, state.header)) {
    items.push({ kind: "header", key: "header", label: "Site header", expected: meta.draftHeader ?? null, after: state.header });
  }
  for (const page of state.pages) {
    const key = `page:${page.id}`;
    const existing = pages.get(page.id);
    const facts = meta.pages[page.id];
    if (!existing || !facts) {
      items.push({ kind: "page_created", key, target_id: page.id, label: pageLabel(page), draft_data: page.draft_data,
        settings: { ...pick(page, PAGE_SETTINGS), slug: page.slug, sort_order: page.sort_order } });
      continue;
    }
    const draftChanged = !jsonEqual(existing.draft_data, page.draft_data);
    const settingsChanged = !jsonEqual(pick(existing, PAGE_SETTINGS), pick(page, PAGE_SETTINGS));
    if (settingsChanged && facts.published &&
      (existing.nav_label !== page.nav_label || Boolean(existing.hide_from_menu) !== Boolean(page.hide_from_menu))) {
      notes.push(`The menu label and visibility of "${pageLabel(existing)}" were left unchanged because that page is live. Change them in Pages.`);
    }
    const settings = settingsChanged && !facts.published ? pick(page, PAGE_SETTINGS) : undefined;
    if (!draftChanged && !settings) continue;
    items.push({ kind: "page", key, target_id: page.id, label: pageLabel(page), expected_version: facts.draftVersion,
      draft_data: mergeDraft(facts.rawDraft, page.draft_data), ...(settings ? { settings } : {}) });
  }
  const posts = new Map(current.posts.map((post) => [post.id, post]));
  for (const post of state.posts) {
    const key = `post:${post.id}`;
    const existing = posts.get(post.id);
    const facts = meta.posts[post.id];
    const fields = pick(post, POST_FIELDS);
    if (!existing || !facts) items.push({ kind: "post_created", key, target_id: post.id, label: post.title, fields });
    else if (!jsonEqual(pick(existing, POST_FIELDS), fields)) {
      items.push({ kind: "post", key, target_id: post.id, label: post.title, expected_updated_at: facts.updatedAt, fields });
    }
  }

  const written = new Set(items.map((item) => item.key));
  const settingsWritten = new Set(items.flatMap((item) =>
    item.kind === "page_created" || (item.kind === "page" && item.settings) ? [item.key] : []));
  const applied: ApplyPlan["changes"] = [];
  for (const { change, keys } of kept) {
    if (keys.delete("footer")) for (const key of footerPages) keys.add(key);
    const touched = [...new Set([...keys].flatMap((key) => {
      const page = key.endsWith(SETTINGS) ? key.slice(0, -SETTINGS.length) : null;
      return page ? (settingsWritten.has(page) ? [page] : []) : written.has(key) ? [key] : [];
    }))];
    if (touched.length) applied.push({ id: change.id, label: change.label, items: touched });
    else dropped.push({ id: change.id, label: change.label, reason: change.kind === "page_settings" ? LIVE_SETTINGS : NO_EFFECT });
  }
  return { items, changes: applied, dropped, notes };
}
