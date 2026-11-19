import { LINK_TYPES, parseSiteLink, safeLegacyHref, type PageSection } from "@/lib/links";

/**
 * Pre-publish broken-link check. Walks every section's props (including
 * slots, arrays and rich text) and reports links to deleted pages,
 * missing section anchors and invalid URLs.
 */

export type LinkQaPage = { id: string; slug: string; sections?: PageSection[] };
export type LinkIssue = { index: number; label: string; problem: string };

const LINK_KEY = /(?:href|link|url)$/i;
const SKIP_KEYS = new Set(["design", "id", "puck", "src", "image", "backgroundImage"]);
const ANCHOR_TAG = /<a\b([^>]*)>/gi;

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1].replaceAll("&amp;", "&") : null;
}

export function findBrokenLinks(
  data: unknown,
  { pages, currentPageId, labels = {} }: { pages: LinkQaPage[]; currentPageId: string; labels?: Record<string, string> },
): LinkIssue[] {
  const content = data && typeof data === "object" ? (data as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return [];
  const byId = new Map(pages.map((page) => [page.id, page]));
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const currentAnchors = new Set(content.flatMap((item) => {
    const anchor = (item as { props?: { design?: { settings?: { anchorId?: unknown } } } })?.props?.design?.settings?.anchorId;
    return typeof anchor === "string" && anchor ? [anchor] : [];
  }));
  const anchorsOf = (page: LinkQaPage) => page.id === currentPageId
    ? currentAnchors
    : new Set((page.sections ?? []).flatMap(({ anchor }) => anchor ? [anchor] : []));

  const issues: LinkIssue[] = [];
  content.forEach((item, index) => {
    const type = (item as { type?: unknown })?.type;
    const label = typeof type === "string" ? labels[type] ?? type : "Section";
    const problems = new Set<string>();

    const checkPageAnchor = (page: LinkQaPage | undefined, anchor: string | undefined, name: string) => {
      if (!page) { problems.add(`${name} links to a deleted page`); return; }
      if (anchor && !anchorsOf(page).has(anchor)) problems.add(`${name} links to a missing section (#${anchor})`);
    };
    const checkLegacy = (href: string, name: string) => {
      const trimmed = href.trim();
      if (!trimmed || trimmed === "#") return;
      const safe = safeLegacyHref(trimmed);
      if (!safe) { problems.add(`${name} has an invalid link`); return; }
      if (safe.startsWith("#")) {
        if (!currentAnchors.has(safe.slice(1))) problems.add(`${name} links to a missing section (${safe})`);
      } else if (safe.startsWith("/")) {
        const [path, hash] = safe.split("#");
        const slug = decodeURIComponent(path.split("?")[0].replace(/^\/|\/$/g, ""));
        checkPageAnchor(bySlug.get(slug), hash || undefined, name);
      }
    };
    const checkRichText = (html: string, name: string) => {
      for (const [, attrs] of html.matchAll(ANCHOR_TAG)) {
        const pageId = attribute(attrs, "data-page-id");
        const href = attribute(attrs, "href") ?? "";
        if (pageId) checkPageAnchor(byId.get(pageId), href.split("#")[1] || undefined, name);
        else checkLegacy(href, name);
      }
    };
    const walk = (value: unknown, key: string, name: string) => {
      if (SKIP_KEYS.has(key)) return;
      if (typeof value === "string") {
        if (value.includes("<a")) checkRichText(value, name);
        else if (LINK_KEY.test(key)) checkLegacy(value, name);
        return;
      }
      if (Array.isArray(value)) { value.forEach((entry) => walk(entry, key, name)); return; }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record.type === "string" && (LINK_TYPES as readonly string[]).includes(record.type) && LINK_KEY.test(key)) {
        const link = parseSiteLink(value);
        if (!link) problems.add(`${name} has an invalid link`);
        else if (link.type === "page") checkPageAnchor(byId.get(link.pageId), link.anchor, name);
        else if (link.type === "anchor" && !currentAnchors.has(link.anchor)) problems.add(`${name} links to a missing section (#${link.anchor})`);
        return;
      }
      // Nested components (slots) report under their own component label.
      const nestedName = typeof record.type === "string" && record.props ? labels[record.type] ?? record.type : name;
      for (const [childKey, child] of Object.entries(record.props && typeof record.props === "object" ? record.props as Record<string, unknown> : record)) {
        walk(child, childKey, nestedName);
      }
    };
    const props = (item as { props?: Record<string, unknown> })?.props ?? {};
    for (const [key, value] of Object.entries(props)) walk(value, key, label);
    for (const problem of problems) issues.push({ index, label, problem });
  });
  return issues;
}
