import { z } from "zod";

/**
 * Site links. Picker-authored links are stored as typed objects; internal
 * page links keep only the page id so they survive renames and resolve to
 * the current slug at render time. Older content stores plain strings,
 * which remain supported and are validated the same way.
 */

export const LINK_TYPES = ["page", "anchor", "url", "email", "phone", "file"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function normalizeAnchor(value: string): string {
  return value.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]/g, "").slice(0, 60);
}

const anchorSchema = z.string().max(60).regex(/^[a-z0-9_-]*$/, "Use lowercase letters, numbers, dashes or underscores.");
const options = { newTab: z.boolean().optional(), nofollow: z.boolean().optional() };

export const siteLinkSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("page"), pageId: z.uuid(), anchor: anchorSchema.optional(), ...options }),
  z.strictObject({ type: z.literal("anchor"), anchor: anchorSchema.min(1), ...options }),
  z.strictObject({ type: z.literal("url"), url: z.string().max(2000), ...options }),
  z.strictObject({ type: z.literal("email"), email: z.email().max(254), subject: z.string().max(200).optional(), ...options }),
  z.strictObject({ type: z.literal("phone"), phone: z.string().regex(/^\+?\d{3,20}$/), ...options }),
  z.strictObject({ type: z.literal("file"), url: z.string().max(2000), name: z.string().max(255).optional(), ...options }),
]);
export type SiteLink = z.infer<typeof siteLinkSchema>;
/** A stored link prop: a typed link, a legacy string, or empty. */
export type LinkValue = SiteLink | string | null | undefined;

/** pageId → public path (with preview prefix and query when previewing). */
export type LinkContext = { pages: Record<string, string> };
export type ResolvedLink = { href: string; newTab: boolean; nofollow: boolean; broken: boolean };

/** Adds https:// to bare domains; returns null unless the result is a credential-free http(s) URL. */
export function normalizeExternalUrl(input: string): string | null {
  let value = input.trim();
  if (!value || value.length > 2000 || /[\s\\]/.test(value)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (value.startsWith("//") || value.startsWith("/") || value.startsWith("#")) return null;
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) && url.hostname !== "localhost") return null;
    return value;
  } catch {
    return null;
  }
}

/** Strips spacing and punctuation; keeps a leading +. */
export function normalizePhone(input: string): string | null {
  const value = input.trim().replace(/^tel:/i, "").replace(/[\s().\-/]/g, "");
  return /^\+?\d{3,20}$/.test(value) ? value : null;
}

export function normalizeEmail(input: string): string | null {
  const value = input.trim().replace(/^mailto:/i, "");
  return z.email().max(254).safeParse(value).success ? value : null;
}

export function pagePath(slug: string, previewPrefix = ""): string {
  return `${previewPrefix}/${slug.split("/").map(encodeURIComponent).join("/")}${previewPrefix ? "?preview=1" : ""}`;
}

export function linkContext(pages: { id: string; slug: string }[], previewPrefix?: string): LinkContext {
  return { pages: Object.fromEntries(pages.map(({ id, slug }) => [id, pagePath(slug, previewPrefix)])) };
}

/** Reads the link context that the renderer/editor passes as Puck metadata. */
export function linkContextFrom(metadata: unknown): LinkContext | undefined {
  const value = metadata && typeof metadata === "object" ? (metadata as { siteLinks?: unknown }).siteLinks : undefined;
  return value && typeof value === "object" && "pages" in value && value.pages && typeof value.pages === "object"
    ? value as LinkContext : undefined;
}

/** Legacy string links: http(s), mailto, tel, site-relative paths and #anchors only. */
export function safeLegacyHref(value: string): string | null {
  const href = value.trim();
  if (!href || href.length > 2000 || /[\u0000-\u001f]/.test(href)) return null;
  if (/^mailto:/i.test(href)) {
    const [address, query] = href.split("?");
    return normalizeEmail(address) ? `${address}${query ? `?${encodeURI(decodeSafe(query))}` : ""}` : null;
  }
  if (/^tel:/i.test(href)) return normalizePhone(href) ? `tel:${normalizePhone(href)}` : null;
  if (/[\s\\]/.test(href)) return null;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href;
  return normalizeExternalUrl(href);
}

function decodeSafe(value: string) {
  try { return decodeURI(value); } catch { return value; }
}

export function parseSiteLink(value: unknown): SiteLink | null {
  const parsed = siteLinkSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A link already resolved for rendering (see resolveDataLinks). Blocks get
 * these instead of typed links, so they need no link context of their own.
 */
export type RenderedLink = { __resolved: true; href: string; newTab: boolean; nofollow: boolean; broken: boolean };
function isRendered(value: unknown): value is RenderedLink {
  return Boolean(value && typeof value === "object" && (value as RenderedLink).__resolved === true && typeof (value as RenderedLink).href === "string");
}

/** Turns a stored link into safe anchor attributes. Unknown or unsafe values become "#". */
export function resolveLink(value: unknown, context?: LinkContext): ResolvedLink {
  const empty = { href: "#", newTab: false, nofollow: false, broken: false };
  if (value == null || value === "") return empty;
  if (isRendered(value)) {
    const href = value.href === "#" ? "#" : safeLegacyHref(value.href);
    return href ? { href, newTab: value.newTab === true, nofollow: value.nofollow === true, broken: value.broken === true } : { ...empty, broken: true };
  }
  if (typeof value === "string") {
    const href = safeLegacyHref(value);
    return href ? { ...empty, href } : { ...empty, broken: true };
  }
  const link = parseSiteLink(value);
  if (!link) return { ...empty, broken: true };
  const flags = { newTab: link.newTab === true, nofollow: link.nofollow === true };
  const target = (() => {
    switch (link.type) {
      case "page": {
        const path = context?.pages[link.pageId];
        return path ? `${path}${link.anchor ? `#${link.anchor}` : ""}` : null;
      }
      case "anchor": return `#${link.anchor}`;
      case "url":
      case "file": return normalizeExternalUrl(link.url);
      case "email": return `mailto:${link.email}${link.subject ? `?subject=${encodeURIComponent(link.subject)}` : ""}`;
      case "phone": return `tel:${link.phone}`;
    }
  })();
  return target ? { ...flags, href: target, broken: false } : { ...flags, href: "#", broken: true };
}

/** Attributes for a rendered <a>. */
export function linkAttributes(value: unknown, context?: LinkContext) {
  const link = resolveLink(value, context);
  const rel = [link.newTab ? "noopener noreferrer" : "", link.nofollow ? "nofollow" : ""].filter(Boolean).join(" ");
  return { href: link.href, ...(link.newTab ? { target: "_blank" as const } : {}), ...(rel ? { rel } : {}) };
}

/** Plain-text href for blocks that only need a string (e.g. menu matching). */
export function linkHref(value: unknown, context?: LinkContext): string {
  return resolveLink(value, context).href;
}

export function describeLink(value: LinkValue, pages: { id: string; title: string | null; slug: string }[] = []): string {
  if (!value) return "No link";
  if (typeof value === "string") return value;
  switch (value.type) {
    case "page": {
      const page = pages.find(({ id }) => id === value.pageId);
      const name = page ? page.title || (page.slug ? `/${page.slug}` : "Home") : "Deleted page";
      return value.anchor ? `${name} › #${value.anchor}` : name;
    }
    case "anchor": return `#${value.anchor}`;
    case "url": return value.url;
    case "email": return value.email;
    case "phone": return value.phone;
    case "file": return value.name || value.url.split("/").pop() || "File";
  }
}

/** Top-level sections and their anchor IDs, for the picker and link QA. */
export type PageSection = { index: number; id: string; anchor: string | null; label: string };
export function pageSections(data: unknown): PageSection[] {
  const content = data && typeof data === "object" ? (data as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const { type, props } = item as { type?: unknown; props?: Record<string, unknown> };
    if (typeof type !== "string" || !props) return [];
    const settings = (props.design as { settings?: { anchorId?: unknown } } | undefined)?.settings;
    const anchor = typeof settings?.anchorId === "string" ? normalizeAnchor(settings.anchorId) || null : null;
    const heading = [props.heading, props.title, props.eyebrow, props.businessName].find((text) => typeof text === "string" && text.trim());
    const label = typeof heading === "string" ? heading.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : type;
    return [{ index, id: String(props.id ?? index), anchor, label: label || type }];
  });
}

/** Suggests a unique anchor from a section label. */
export function suggestAnchor(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = normalizeAnchor(label.replace(/\s+/g, "-")).replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "section";
  let anchor = base;
  for (let i = 2; used.has(anchor); i++) anchor = `${base}-${i}`;
  return anchor;
}

const PAGE_ID_ATTR = /\sdata-page-id="([0-9a-f-]{36})"/i;

/** Points rich text page links (<a data-page-id>) at the page's current path. */
export function resolveRichTextLinks(html: string, context: LinkContext): string {
  if (!html.includes("data-page-id")) return html;
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const pageId = PAGE_ID_ATTR.exec(tag)?.[1];
    const path = pageId ? context.pages[pageId.toLowerCase()] : undefined;
    if (!path) return tag;
    const fragment = /\shref="[^"#]*(#[a-z0-9_-]*)"/i.exec(tag)?.[1] ?? "";
    const href = `${path}${fragment}`.replaceAll("&", "&amp;");
    return /\shref="[^"]*"/i.test(tag) ? tag.replace(/\shref="[^"]*"/i, ` href="${href}"`) : tag.replace(/^<a\b/i, `<a href="${href}"`);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || "$$typeof" in value) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Resolves every typed link in Puck data (or one block's props) into a
 * RenderedLink, and optionally rich text page links. Leaves functions and
 * React elements (editor slots, inline rich text) untouched.
 */
export function resolveDataLinks<T>(data: T, context: LinkContext, options: { richText?: boolean } = { richText: true }): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return options.richText ? resolveRichTextLinks(value, context) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (!isPlainObject(value)) return value;
    if (typeof value.type === "string" && (LINK_TYPES as readonly string[]).includes(value.type) && parseSiteLink(value)) {
      return { __resolved: true, ...resolveLink(value, context) } satisfies RenderedLink;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
  };
  return walk(data) as T;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * After a slug change, rewrites legacy string links (and rich text hrefs)
 * that still point at "/old" so they follow the page. Typed page links
 * need no rewrite: they store the page id.
 */
export function rewriteLegacyPageLinks<T>(data: T, oldSlug: string, newSlug: string): { data: T; changed: number } {
  if (!oldSlug || oldSlug === newSlug) return { data, changed: 0 };
  const oldPath = pagePath(oldSlug);
  const newPath = pagePath(newSlug);
  const exact = new RegExp(`^${escapeRegExp(oldPath)}(?=$|[#?])`);
  const inHtml = new RegExp(`(\\shref=")${escapeRegExp(oldPath)}(?=["#?])`, "g");
  let changed = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (exact.test(value)) { changed++; return value.replace(exact, newPath); }
      if (value.includes("href=")) {
        return value.replace(inHtml, (_match, prefix: string) => { changed++; return `${prefix}${newPath}`; });
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
    return value;
  };
  const next = walk(data) as T;
  return { data: changed ? next : data, changed };
}
