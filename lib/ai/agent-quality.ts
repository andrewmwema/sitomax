import type { Field } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import { normalizeAnchor, parseSiteLink, resolveLink } from "@/lib/links";
import { defaultMenuLabel, menuLabelSchema } from "@/lib/page-navigation";
import { assessContrast, bestContrastingTextColor, nearestContrast, resolveContrastBackgrounds } from "@/lib/theme/contrast";
import { buildThemeStyle, DEFAULT_COLORS } from "@/lib/theme/presets";
import { themeSchema } from "@/lib/theme/schema";
import { hasCenteredIndent } from "@/lib/sections/indent-qa";
import { alignmentProblemSummary, findAlignmentProblems } from "@/lib/sections/alignment-qa";

type Item = { type: string; props: Record<string, unknown> };
type QualityPage = {
  id: string; slug: string; title: string | null; nav_label?: string | null; hide_from_menu?: boolean;
  draft_data: unknown; seo?: unknown;
};
export type QualitySite = {
  theme: unknown; header: unknown; footer: unknown; pages: QualityPage[];
  posts?: { id: string; title: string; excerpt?: string; draft_content?: unknown }[];
  blogPath?: string;
};
/** What the check changed for the user, and what it leaves for them to look at. */
export type QualityReport = { fixed: string[]; notes: string[] };

type Kind = "contrast" | "empty_text" | "broken_link" | "nav_label" | "placeholder" | "alignment";
type Finding = {
  /** Stable identity, so problems that were already on the site are not blamed on the changes. */
  key: string; kind: Kind; pageId?: string; where: string; detail: string;
  /** Repairs the problem in the site it was found in. */
  fix?: () => void;
};

const MENU_ITEMS = 7;
const DEVICES = ["desktop", "tablet", "mobile"] as const;
const PLACEHOLDER = /\[[^[\]\n]{2,60}\]|\{\{[^{}\n]{2,60}\}\}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isItem(value: unknown): value is Item {
  return isRecord(value) && typeof value.type === "string" && isRecord(value.props);
}
function fieldsOf(type: string) {
  return (puckConfig.components[type as keyof typeof puckConfig.components]?.fields ?? {}) as Record<string, Field>;
}
function labelOf(type: string) {
  return puckConfig.components[type as keyof typeof puckConfig.components]?.label ?? type;
}
function plain(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|[\u200b-\u200f\ufeff]/gi, " ").replace(/\s+/g, " ").trim();
}
function pageLabel(page: QualityPage) {
  return page.title?.trim() || (page.slug ? page.slug.replaceAll("/", " / ") : "Home");
}
function content(page: QualityPage): Item[] {
  return isRecord(page.draft_data) && Array.isArray(page.draft_data.content) ? page.draft_data.content.filter(isItem) : [];
}
function isLink(field: Field, key: string) {
  return (field.type === "custom" && "aiKind" in field && field.aiKind === "link") ||
    ((field.type === "text" || field.type === "textarea") && /(?:href|link)$/i.test(key));
}
function isImage(field: Field) {
  return field.type === "custom" && "aiKind" in field && field.aiKind === "image";
}

/** Link values and visible text of one block, following its list and group fields. */
function scanProps(fields: Record<string, Field>, value: unknown, found: { links: [string, unknown][]; text: string[] }, prefix = "") {
  if (!isRecord(value)) return;
  for (const [key, field] of Object.entries(fields)) {
    const child = value[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (key === "design" || field.type === "slot" || isImage(field)) continue;
    if (isLink(field, key)) found.links.push([path, child]);
    else if (field.type === "array" && Array.isArray(child)) {
      child.forEach((entry, index) => scanProps(field.arrayFields as Record<string, Field>, entry, found, `${path}.${index}`));
    } else if (field.type === "object") scanProps(field.objectFields as Record<string, Field>, child, found, path);
    else if (typeof child === "string" && ["text", "textarea", "richtext"].includes(field.type)) found.text.push(child);
  }
}
function hrefs(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) value.forEach((entry) => hrefs(entry, found));
  else if (isRecord(value)) for (const [key, child] of Object.entries(value)) {
    if (key === "href") found.push(child);
    else hrefs(child, found);
  }
  return found;
}
function strings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, found));
  else if (isRecord(value)) Object.values(value).forEach((entry) => strings(entry, found));
  return found;
}
function menuLabels(site: QualitySite) {
  return site.pages.filter((page) => !page.hide_from_menu)
    .map((page) => menuLabelSchema.safeParse(page.nav_label).data ?? defaultMenuLabel(page.slug));
}
function placeholders(text: string) {
  return [...new Set(plain(text).match(new RegExp(PLACEHOLDER, "g")) ?? [])];
}

function inspect(site: QualitySite): Finding[] {
  const findings: Finding[] = [];
  const theme = themeSchema.safeParse(site.theme).data ?? {};
  const colors = { ...DEFAULT_COLORS, ...theme.colors };
  const darkBackground = (buildThemeStyle(theme) as Record<string, string>)["--color-dark-bg"];
  const blogPath = `/${(site.blogPath ?? "/blog").split("/").filter(Boolean).join("/")}`;
  const anchors = new Map<string, Set<string>>();
  const paths = new Map<string, QualityPage>();
  for (const page of site.pages) {
    paths.set(`/${page.slug}`, page);
    const found = new Set<string>();
    const collect = (items: Item[]) => items.forEach((item) => {
      if (item.type === "ContactForm") found.add("contact");
      const settings = isRecord(item.props.design) && isRecord(item.props.design.settings) ? item.props.design.settings : {};
      if (typeof settings.anchorId === "string" && normalizeAnchor(settings.anchorId)) found.add(normalizeAnchor(settings.anchorId));
      for (const [key, field] of Object.entries(fieldsOf(item.type))) {
        if (field.type === "slot" && Array.isArray(item.props[key])) collect(item.props[key].filter(isItem));
      }
    });
    collect(content(page));
    anchors.set(page.id, found);
  }

  /** Why a link leads nowhere, or null. `page` is absent for the shared header and footer. */
  const linkProblem = (value: unknown, page?: QualityPage): string | null => {
    if (value == null || value === "") return null;
    const section = (target: QualityPage | undefined, anchor: string) =>
      !target || !anchor || anchors.get(target.id)?.has(normalizeAnchor(anchor)) ? null
        : `links to #${anchor}, which is not a section on ${target === page ? "this page" : pageLabel(target)}`;
    if (typeof value === "string") {
      const href = value.trim();
      if (href === "#" || PLACEHOLDER.test(href)) return `has a placeholder link (${href.slice(0, 60)})`;
      if (href.startsWith("#")) return section(page, href.slice(1));
      if (href.startsWith("/") && !href.startsWith("//")) {
        const [path, anchor = ""] = href.split("?")[0].split("#");
        const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
        const target = paths.get(clean);
        if (target) return section(target, anchor);
        return clean === blogPath || clean.startsWith(`${blogPath}/`) ? null : `links to ${clean}, which is not a page on this site`;
      }
      return resolveLink(href).broken ? `has a link that cannot be opened (${href.slice(0, 60)})` : null;
    }
    const link = parseSiteLink(value);
    if (!link) return "has a link that cannot be opened";
    if (link.type === "page") {
      const target = site.pages.find((entry) => entry.id === link.pageId);
      return target ? section(target, link.anchor ?? "") : "links to a page that is not on this site";
    }
    if (link.type === "anchor") return section(page, link.anchor);
    return resolveLink(link).broken ? "has a link that cannot be opened" : null;
  };

  for (const page of site.pages) {
    const where = pageLabel(page);
    // `surfaces` is null where the background behind the text is not known: over an image or
    // video, and inside curated blocks, whose layouts place text on backgrounds of their own.
    const visit = (items: Item[], surfaces: string[] | null, nested: boolean) => {
      for (const item of [...items]) {
        const { type, props } = item;
        if (type === "Embed" || type === "Navigation") continue;
        const id = String(props.id ?? "");
        const name = `${where} › ${labelOf(type)}`;
        const design = isRecord(props.design) ? props.design : undefined;
        const layout = nested || type === "Section";
        const base = !layout ? null
          : type === "Column" && (props.surface === "card" || props.surface === "highlight") ? [colors.background]
            : props.background === "primary" ? [colors.primary]
              : props.background === "dark" ? [darkBackground]
                : props.background === "default" ? [colors.background] : surfaces;
        const media = isRecord(design?.background) && (design.background.type === "image" || design.background.type === "video");
        const own = media ? [] : resolveContrastBackgrounds(design, []);
        const active = own.length ? own : media ? null : base;
        const appearance = design && isRecord(design.appearance) ? design.appearance : {};
        const unreadable = !active ? [] : DEVICES.flatMap((device) => {
          const settings = appearance[device];
          if (!isRecord(settings) || typeof settings.textColor !== "string") return [];
          const color = settings.textColor;
          return active.some((background) => assessContrast(color, background)?.passes === false) ? [{ settings, color }] : [];
        });
        if (active && unreadable.length) {
          const repairs = unreadable.map(({ settings, color }) =>
            ({ settings, color: nearestContrast(color, active) ?? bestContrastingTextColor(active) }));
          findings.push({
            key: `${page.id}:${id}:contrast`, kind: "contrast", pageId: page.id, where,
            detail: `${name}: the text colour is hard to read on its background.`,
            ...(repairs.every(({ color }) => color) ? { fix: () => { for (const { settings, color } of repairs) settings.textColor = color; } } : {}),
          });
        }

        const empty = (type === "Heading" || type === "Text") ? !plain(String(props.text ?? ""))
          : type === "Button" ? !plain(String(props.label ?? "")) : false;
        if (empty && nested) {
          findings.push({
            key: `${page.id}:${id}:empty`, kind: "empty_text", pageId: page.id, where,
            detail: `${name}: an empty ${type === "Button" ? "button" : "text block"}.`,
            fix: () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); },
          });
          continue;
        }
        if (type === "Hero" && !plain(String(props.heading ?? ""))) {
          findings.push({ key: `${page.id}:${id}:empty:heading`, kind: "empty_text", pageId: page.id, where, detail: `${name}: the heading is empty.` });
        }

        const found = { links: [] as [string, unknown][], text: [] as string[] };
        scanProps(fieldsOf(type), props, found);
        if (hasCenteredIndent({ type, props: { ...props, ...Object.fromEntries(
          Object.entries(fieldsOf(type)).filter(([, field]) => field.type === "slot").map(([key]) => [key, undefined]),
        ) } })) {
          findings.push({
            key: `${page.id}:${id}:indent`, kind: "alignment", pageId: page.id, where,
            detail: `${name}: centered text has a large indent that may shift it. Remove the indent if it is not intentional.`,
          });
        }
        // Unequal left and right spacing does the same; it is judged with the whole section in view.
        if (!nested) {
          for (const problem of findAlignmentProblems(item).filter((entry) => entry.cause === "spacing")) {
            findings.push({
              key: `${page.id}:${problem.id}:offset`, kind: "alignment", pageId: page.id, where,
              detail: `${where} › ${labelOf(problem.type)}: ${alignmentProblemSummary(problem)}`,
            });
          }
        }
        for (const [path, value] of found.links) {
          let problem = linkProblem(value, page);
          const label = type === "Button" && path === "href" ? props.label : props[path.replace(/Link$/, "Text")];
          if (!problem && (value == null || value === "") && typeof label === "string" && plain(label) && (type === "Button" || /Link$/.test(path))) {
            problem = "has no link";
          }
          if (!problem) continue;
          const button = typeof label === "string" && plain(label) ? ` “${plain(label).slice(0, 40)}”` : "";
          findings.push({
            // Without the list position, so reordering a list does not make an old link look new.
            key: `${page.id}:${id}:link:${path.replace(/\.\d+(?=\.|$)/g, "")}:${JSON.stringify(value ?? "")}`, kind: "broken_link", pageId: page.id, where,
            detail: `${name}:${button ? ` the button${button}` : " a link"} ${problem}.`,
          });
        }
        for (const token of new Set(found.text.flatMap(placeholders))) {
          findings.push({ key: `${page.id}:${id}:placeholder:${token}`, kind: "placeholder", pageId: page.id, where, detail: token });
        }
        for (const [key, field] of Object.entries(fieldsOf(type))) {
          const children = props[key];
          if (field.type !== "slot" || !Array.isArray(children)) continue;
          // Children are visited in place so that a fix can remove one from its column.
          if (children.every(isItem)) visit(children as Item[], active, true);
        }
      }
    };
    visit(content(page).filter((item) => item.type !== "Footer"), [colors.background], false);

    const seo = isRecord(page.seo) ? page.seo : {};
    for (const token of new Set([page.title, seo.title, seo.description].flatMap((value) => typeof value === "string" ? placeholders(value) : []))) {
      findings.push({ key: `${page.id}:meta:placeholder:${token}`, kind: "placeholder", pageId: page.id, where: `${where} (page title and SEO)`, detail: token });
    }
    if (page.nav_label != null && !menuLabelSchema.safeParse(page.nav_label).success) {
      const label = defaultMenuLabel(page.slug);
      findings.push({
        key: `${page.id}:nav:${page.nav_label}`, kind: "nav_label", pageId: page.id, where,
        detail: `${where}: the menu label was not usable and is now “${label}”.`, fix: () => { page.nav_label = label; },
      });
    }
  }

  const menu = menuLabels(site);
  for (const label of new Set(menu.filter((entry, index) => menu.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) !== index))) {
    findings.push({ key: `nav:duplicate:${label.toLowerCase()}`, kind: "nav_label", where: "Menu", detail: `Menu: more than one page is called “${label}”.` });
  }
  for (const [where, value] of [["Header", site.header], ["Footer", site.footer]] as const) {
    for (const href of hrefs(value)) {
      const problem = linkProblem(href);
      if (problem) findings.push({ key: `${where}:link:${JSON.stringify(href)}`, kind: "broken_link", where, detail: `${where}: a menu link ${problem}.` });
    }
  }
  for (const post of site.posts ?? []) {
    // Each piece of text on its own: the stored JSON around it has brackets of its own.
    for (const token of new Set([post.title, post.excerpt ?? "", ...strings(post.draft_content)].flatMap(placeholders))) {
      findings.push({ key: `post:${post.id}:placeholder:${token}`, kind: "placeholder", where: `Blog post “${post.title}”`, detail: token });
    }
  }
  return findings;
}

function count(total: number, one: string, many: string) {
  return `${total} ${total === 1 ? one : many}`;
}

/**
 * Compares the site before and after the agent's changes. Problems the changes
 * introduced are repaired where that is safe (unreadable text colours, empty
 * text blocks, unusable menu labels) and reported otherwise (links that lead
 * nowhere, placeholders left to fill in, menu clashes).
 *
 * Returns the repaired site, the pages that were repaired and the report.
 */
export function checkQuality<T extends QualitySite>(baseline: QualitySite, working: T): {
  site: T; fixedPages: Map<string, string>; report: QualityReport;
} {
  const known = new Set(inspect(baseline).map((finding) => finding.key));
  const site = structuredClone(working);
  const fixes = inspect(site).filter((finding) => finding.fix && finding.pageId && !known.has(finding.key));
  for (const finding of fixes) finding.fix!();

  const fixedPages = new Map<string, string>();
  for (const pageId of new Set(fixes.map((finding) => finding.pageId!))) {
    const mine = fixes.filter((finding) => finding.pageId === pageId);
    const of = (kind: Kind) => mine.filter((finding) => finding.kind === kind).length;
    fixedPages.set(pageId, `${mine[0].where}: ${[
      of("contrast") ? `adjusted ${count(of("contrast"), "text colour", "text colours")} to stay readable` : "",
      of("empty_text") ? `removed ${count(of("empty_text"), "empty text block or button", "empty text blocks or buttons")}` : "",
      of("nav_label") ? "replaced a menu label that could not be used" : "",
    ].filter(Boolean).join(", ")}.`);
  }

  const changedPages = new Set(site.pages.filter((page) => {
    const previous = baseline.pages.find((entry) => entry.id === page.id);
    return !previous || JSON.stringify(previous.draft_data) !== JSON.stringify(page.draft_data);
  }).map((page) => page.id));
  const left = inspect(site).filter((finding) => !known.has(finding.key) ||
    (finding.kind === "alignment" && finding.pageId !== undefined && changedPages.has(finding.pageId)));
  const notes = left.filter((finding) => finding.kind !== "placeholder").map((finding) => finding.detail);
  const menu = menuLabels(site).length;
  if (menu > MENU_ITEMS && menu > menuLabels(baseline).length) {
    notes.push(`Menu: there are now ${menu} pages in the menu. Consider hiding some so it fits on small screens.`);
  }
  const tokens = new Map<string, string[]>();
  for (const finding of left.filter((entry) => entry.kind === "placeholder")) {
    tokens.set(finding.where, [...tokens.get(finding.where) ?? [], finding.detail]);
  }
  for (const [where, list] of tokens) {
    const unique = [...new Set(list)];
    notes.push(`${where}: ${count(unique.length, "placeholder", "placeholders")} to fill in before publishing: ${unique.slice(0, 8).join(", ")}${unique.length > 8 ? ", …" : ""}.`);
  }
  const limit = 20;
  return {
    site, fixedPages,
    report: {
      fixed: [...fixedPages.values()],
      notes: notes.length > limit ? [...notes.slice(0, limit), `…and ${notes.length - limit} more.`] : notes,
    },
  };
}
