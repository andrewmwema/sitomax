import { snapSpacing } from "@/lib/layout/spacing";
import { ROW_LAYOUTS } from "@/lib/layout/structure";
import { slugify } from "@/lib/page-slugs";
import { addNote, lookup, parseJson, readNumber } from "./lenient-input";

/**
 * Rewrites the shapes models commonly send into the shapes the agent's tools
 * take, before anything is validated. Nothing here widens what a tool accepts:
 * the result still goes through the tool's schema, so a value that is wrong
 * after this is still refused.
 */
type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** An object, also when it was written as a JSON string. */
function asRecord(value: unknown): Json | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return isRecord(parsed) ? parsed : null;
}
function asList(value: unknown): unknown[] | null {
  const parsed = typeof value === "string" ? parseJson(value) ?? value : value;
  return Array.isArray(parsed) ? parsed : parsed === undefined || parsed === null ? null : [parsed];
}
/** Moves the first alias that is present to `key`, unless `key` is already set. */
function rename(target: Json, key: string, ...aliases: string[]) {
  for (const alias of aliases) {
    if (!(alias in target)) continue;
    if (target[key] === undefined) target[key] = target[alias];
    delete target[alias];
  }
}
function child(target: Json, key: string): Json {
  const existing = target[key];
  if (isRecord(existing)) return existing;
  const created: Json = {};
  target[key] = created;
  return created;
}

// Only names with one meaning. Which green "green" is, is for the model to say.
const COLOR_NAMES: Record<string, string> = { white: "#ffffff", black: "#000000", transparent: "" };
/** "#FFFFFFFF", "rgb(255, 255, 255)" and "white" as a six-digit hex colour. Anything else is returned as it is. */
export function normalizeColor(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(text)) return text.slice(0, 7);
  if (/^[0-9a-f]{6}$/.test(text)) return `#${text}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(text);
  if (rgb) return `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
  return lookup(COLOR_NAMES, text) ?? value;
}

const DEVICES = ["desktop", "tablet", "mobile"];
const SIDES = ["Top", "Right", "Bottom", "Left"];
const BOX_KEYS = ["margin", "padding"].flatMap((box) => SIDES.map((side) => `${box}${side}`));
const SETTINGS = ["hideOnDesktop", "hideOnTablet", "hideOnMobile", "fullBleed"];
const SHADOWS: Record<string, string> = { true: "soft", false: "none", sm: "soft", small: "soft", light: "soft", subtle: "soft", md: "medium", lg: "strong", large: "strong", xl: "strong", heavy: "strong" };
/** Keys that say how a block looks. Sent among content props, they are meant as design. */
export const DESIGN_KEYS = new Set([
  "background", "backgroundColor", "textColor", "color", "fontColor", "spacing", "appearance", "border", "borderRadius", "shadow",
  "animation", "settings", "padding", "paddingX", "paddingY", "margin", "marginX", "marginY", "textAlign", ...BOX_KEYS,
]);

/** padding: 64 as its four sides, paddingY: 64 as top and bottom. */
function expandBox(box: Json) {
  for (const name of ["margin", "padding"]) {
    const sides: [string, string[]][] = [[name, SIDES], [`${name}Y`, ["Top", "Bottom"]], [`${name}Vertical`, ["Top", "Bottom"]],
      [`${name}X`, ["Left", "Right"]], [`${name}Horizontal`, ["Left", "Right"]]];
    for (const [shorthand, targets] of sides) {
      if (!(shorthand in box)) continue;
      const amount = readNumber(box[shorthand]);
      if (amount !== null) for (const side of targets) box[`${name}${side}`] ??= amount;
      delete box[shorthand];
    }
  }
}
/** { paddingTop: 96 } as { desktop: { paddingTop: 96 } }: settings without a device are for all screens. */
function perDevice(design: Json, group: string) {
  const value = design[group];
  if (!isRecord(value)) return;
  const flat = Object.keys(value).filter((key) => !DEVICES.includes(key));
  if (!flat.length) return;
  const desktop = child(value, "desktop");
  for (const key of flat) {
    desktop[key] ??= value[key];
    delete value[key];
  }
}

/**
 * A design patch as update_section_design takes it. Models often write the
 * CSS they have in mind: textColor or backgroundColor at the top, a colour as
 * the background, padding without a device, a shadow as true.
 */
export function normalizeDesignPatch(raw: unknown): unknown {
  const source = asRecord(raw);
  if (!source) return raw;
  const design = structuredClone(source);
  if (Object.keys(design).length === 1 && isRecord(design.design)) return normalizeDesignPatch(design.design);

  if (typeof design.background === "string") {
    const color = normalizeColor(design.background);
    design.background = color === "" || design.background === "none" ? { type: "none" } : { type: "color", color };
  }
  if ("backgroundColor" in design) {
    const color = normalizeColor(design.backgroundColor);
    if (design.background === undefined) design.background = color === "" ? { type: "none" } : { type: "color", color };
    delete design.backgroundColor;
  }
  if (isRecord(design.background)) {
    const background = design.background;
    rename(background, "type", "kind");
    if (typeof background.image === "string" && background.images === undefined) background.images = [background.image];
    delete background.image;
    if (background.type === "solid") background.type = "color";
    if (background.type === undefined) {
      background.type = background.from || background.to ? "gradient" : background.color ? "color" : background.images ? "image" : undefined;
    }
    if (background.type === "gradient") background.angle ??= 135;
    for (const key of ["color", "from", "to", "overlayColor"]) if (key in background) background[key] = normalizeColor(background[key]);
  }

  // A text colour in the page's own words: the setting lives under appearance, per device.
  rename(design, "textColor", "color", "fontColor", "foreground");
  if (typeof design.textColor === "string" && !["auto", "inherit"].includes(design.textColor)) {
    // "light" and "dark" are how the editor names white and near-black text.
    const color = lookup<string>({ light: "#ffffff", dark: "#111827" }, design.textColor.trim().toLowerCase()) ?? design.textColor;
    child(child(design, "appearance"), "desktop").textColor ??= color;
    delete design.textColor;
  }
  rename(design, "align", "textAlign");
  for (const key of ["align", "borderRadius"]) {
    if (!(key in design)) continue;
    child(child(design, "appearance"), "desktop")[key] ??= design[key];
    delete design[key];
  }
  expandBox(design);
  for (const key of BOX_KEYS) {
    if (!(key in design)) continue;
    child(child(design, "spacing"), "desktop")[key] ??= design[key];
    delete design[key];
  }
  for (const key of SETTINGS) {
    if (!(key in design)) continue;
    child(design, "settings")[key] ??= design[key];
    delete design[key];
  }
  for (const group of ["spacing", "appearance"]) {
    perDevice(design, group);
    const devices = design[group];
    if (!isRecord(devices)) continue;
    for (const device of DEVICES) {
      const settings = devices[device];
      if (!isRecord(settings)) continue;
      if (group === "spacing") expandBox(settings);
      else {
        rename(settings, "textColor", "color");
        rename(settings, "align", "textAlign");
        rename(settings, "backgroundColor", "background");
        for (const key of ["textColor", "backgroundColor"]) if (key in settings) settings[key] = normalizeColor(settings[key]);
      }
    }
  }
  if (isRecord(design.border) && "color" in design.border) design.border.color = normalizeColor(design.border.color);
  if (typeof design.shadow === "boolean" || typeof design.shadow === "string") design.shadow = lookup(SHADOWS, String(design.shadow).toLowerCase()) ?? design.shadow;
  return design;
}

const THEME_COLORS = ["primary", "secondary", "accent", "background", "text"];
/** A theme patch as update_theme takes it. */
export function normalizeThemePatch(raw: unknown): unknown {
  const source = asRecord(raw);
  if (!source) return raw;
  const theme = structuredClone(source);
  for (const wrapper of ["theme", "patch"]) {
    if (Object.keys(theme).length === 1 && isRecord(theme[wrapper])) return normalizeThemePatch(theme[wrapper]);
  }
  if (isRecord(theme.fonts)) {
    theme.headingFont ??= theme.fonts.heading;
    theme.bodyFont ??= theme.fonts.body;
    delete theme.fonts;
  }
  if (typeof theme.font === "string") {
    theme.headingFont ??= theme.font;
    theme.bodyFont ??= theme.font;
    delete theme.font;
  }
  rename(theme, "radius", "borderRadius", "cornerRadius");
  rename(theme, "buttonStyle", "buttonShape", "buttons");
  for (const name of THEME_COLORS) {
    for (const alias of [`${name}Color`, name]) {
      if (typeof theme[alias] !== "string") continue;
      child(theme, "colors")[name] ??= theme[alias];
      delete theme[alias];
    }
  }
  if (isRecord(theme.colors)) for (const key of Object.keys(theme.colors)) theme.colors[key] = normalizeColor(theme.colors[key]);
  return theme;
}

const ELEMENT_TYPES: Record<string, string> = Object.fromEntries(Object.entries({
  Heading: "heading title headline h1 h2 h3 h4", Text: "text paragraph richtext rich-text body copy", Button: "button cta link",
  Image: "image photo picture img", IconList: "iconlist icon-list list bulletlist checklist features bullets", Icon: "icon",
  Divider: "divider separator line rule hr", VerticalSpace: "verticalspace vertical-space spacer space gap",
}).flatMap(([type, words]) => words.split(" ").map((entry) => [entry, type])));
const spacing = (value: unknown, fallback: number) => snapSpacing(readNumber(value) ?? fallback);

/** Rich text as the plain text a custom layout's Text element takes: paragraphs, **bold** and *emphasis*. */
function plainText(html: string) {
  if (!/<[a-z][^>]*>/i.test(html)) return html;
  return html.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:strong|b)>/gi, "**").replace(/<\/?(?:em|i)>/gi, "*").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").trim();
}

function normalizeElement(raw: unknown): unknown {
  const element = asRecord(raw);
  if (!element) return typeof raw === "string" && raw.trim() ? { type: "Text", text: raw, align: "left" } : raw;
  const next = { ...element };
  rename(next, "type", "element", "kind", "component");
  if (typeof next.type === "string") next.type = lookup(ELEMENT_TYPES, next.type.trim().toLowerCase().replace(/[\s_]+/g, "-")) ?? next.type;
  // Elements are flat here; a props wrapper is how stored blocks look.
  if (isRecord(next.props)) {
    Object.assign(next, { ...next.props, ...Object.fromEntries(Object.entries(next).filter(([key]) => key !== "props")) });
    delete next.props;
  }
  delete next.id;
  switch (next.type) {
    case "Heading":
      rename(next, "text", "content", "title", "heading", "label");
      next.level ??= "h2";
      if (typeof next.text === "string" && plainText(next.text) !== next.text) next.text = plainText(next.text).replaceAll("**", "");
      break;
    case "Text":
      rename(next, "text", "content", "body", "html", "paragraph");
      if (typeof next.text === "string") next.text = plainText(next.text);
      break;
    case "Button":
      rename(next, "label", "text", "title", "content");
      rename(next, "href", "link", "url", "to");
      next.href ??= "";
      next.variant ??= "primary";
      next.size ??= "md";
      break;
    case "Image":
      rename(next, "query", "search", "prompt", "description", "src", "image", "url");
      rename(next, "aspect", "aspectRatio", "ratio");
      // The image is found by a search; an address says nothing to search for.
      if (typeof next.query === "string" && /^(?:https?:|\/)/i.test(next.query.trim())) delete next.query;
      next.alt ??= typeof next.query === "string" ? next.query : "";
      next.query ??= typeof next.alt === "string" ? next.alt : "";
      next.aspect ??= "4/3";
      next.fit ??= "cover";
      next.radius ??= "theme";
      next.width ??= "100";
      break;
    case "IconList": {
      rename(next, "items", "list", "features", "points", "entries");
      const items = asList(next.items);
      if (items) {
        next.items = items.map((entry) => {
          if (typeof entry === "string") return { icon: "check", text: entry };
          if (!isRecord(entry)) return entry;
          const item = { ...entry };
          rename(item, "text", "label", "title", "content", "name");
          item.icon ??= "check";
          return item;
        });
      }
      rename(next, "iconColor", "color");
      next.iconColor ??= "primary";
      next.size ??= "base";
      next.gap = spacing(next.gap, 12);
      break;
    }
    case "Icon":
      rename(next, "icon", "name");
      next.size ??= "32";
      next.style ??= "plain";
      next.color ??= "primary";
      break;
    case "Divider":
      rename(next, "lineStyle", "style", "line");
      next.lineStyle ??= "solid";
      next.thickness ??= "1";
      next.color ??= "border";
      next.width ??= "100";
      break;
    case "VerticalSpace":
      rename(next, "height", "size", "space", "amount");
      next.height = spacing(next.height, 32);
      next.mobileHeight = spacing(next.mobileHeight, Number(next.height));
      break;
  }
  return next;
}

const layoutFor = (columns: number) => Object.entries(ROW_LAYOUTS).find(([, layout]) => layout.fractions.length === columns)?.[0];

/**
 * A custom section in the compact format of insert_section and create_page.
 * It has many required settings; the ones a model leaves out get the editor's
 * defaults, spacing is moved onto the spacing scale, and the names models use
 * for the same thing (content for elements, text for a button's label) are
 * read as what they mean.
 */
export function normalizeCustomSection(raw: unknown): unknown {
  const source = asRecord(raw);
  if (!source) return raw;
  const section = structuredClone(source);
  if (Object.keys(section).length === 1 && isRecord(section.customSection)) return normalizeCustomSection(section.customSection);
  rename(section, "rowGap", "gap");
  rename(section, "width", "maxWidth", "container");
  // A colour is a design setting; the section's own background is one of four presets.
  if (typeof section.background === "string" && /^#|^rgb/i.test(section.background.trim())) {
    child(section, "design").background ??= section.background;
    delete section.background;
  }
  section.background ??= "default";
  section.width ??= "contained";
  section.rowGap = spacing(section.rowGap, 32);
  if (section.design !== undefined) section.design = normalizeDesignPatch(section.design);
  if (section.rows === undefined) {
    const columns = asList(section.columns);
    const elements = asList(section.elements ?? section.content);
    if (columns) section.rows = [{ columns }];
    else if (elements) section.rows = [{ columns: [{ elements }] }];
    for (const key of ["columns", "elements", "content"]) delete section[key];
  }
  const rows = asList(section.rows);
  if (!rows) return section;
  section.rows = rows.map((entry) => {
    const row = asRecord(entry);
    if (!row) return entry;
    const next = { ...row };
    if (next.columns === undefined) {
      const elements = asList(next.elements ?? next.content);
      if (elements) next.columns = [{ elements }];
      for (const key of ["elements", "content"]) delete next[key];
    }
    const columns = asList(next.columns);
    if (!columns) return next;
    next.columns = columns.map((value) => {
      const column = asRecord(value);
      if (!column) return value;
      const cell = { ...column };
      rename(cell, "elements", "content", "items", "children");
      const elements = asList(cell.elements);
      if (elements) cell.elements = elements.map(normalizeElement);
      cell.surface ??= "none";
      cell.verticalAlign ??= "top";
      cell.gap = spacing(cell.gap, 16);
      return cell;
    });
    // The layout must match the number of columns; when it does not, the even split for that number is meant.
    const layout = typeof next.layout === "string" ? next.layout.trim().replaceAll("/", "-").replaceAll(":", "-") : undefined;
    const known = layout !== undefined && Object.hasOwn(ROW_LAYOUTS, layout) ? ROW_LAYOUTS[layout as keyof typeof ROW_LAYOUTS] : undefined;
    next.layout = known?.fractions.length === columns.length ? layout : layoutFor(columns.length) ?? next.layout;
    next.gap = spacing(next.gap, 32);
    return next;
  });
  return section;
}

const text = (value: unknown) => typeof value === "string" ? value : "";
/** Blog blocks as the blog tools take them. */
function normalizeBlogBlocks(raw: unknown): unknown {
  const blocks = asList(raw);
  if (!blocks) return raw;
  return blocks.map((entry) => {
    if (typeof entry === "string") return { type: "paragraph", html: /<[a-z]/i.test(entry) ? entry : `<p>${entry}</p>` };
    const block = asRecord(entry);
    if (!block) return entry;
    const next = { ...block };
    if (typeof next.type === "string") next.type = next.type.trim().toLowerCase();
    switch (next.type) {
      case "paragraph":
        rename(next, "html", "text", "content", "body");
        if (typeof next.html === "string" && !/<[a-z]/i.test(next.html)) next.html = `<p>${next.html}</p>`;
        break;
      case "heading":
        rename(next, "text", "content", "title", "html");
        next.level ??= 2;
        break;
      case "list":
        rename(next, "items", "list", "entries");
        next.ordered ??= next.style === "ordered" || next.style === "numbered";
        delete next.style;
        if (Array.isArray(next.items)) next.items = next.items.map((item) => isRecord(item) ? text(item.text ?? item.content) : item);
        break;
      case "quote":
        rename(next, "text", "quote", "content");
        rename(next, "attribution", "author", "cite", "source");
        next.attribution ??= "";
        break;
      case "callout":
        rename(next, "text", "content", "body");
        next.title ??= "";
        break;
    }
    return next;
  });
}

/** Other names for a tool's own parameters. */
const PARAMETERS: Record<string, string> = {
  page: "pageId", pageID: "pageId", section: "sectionId", sectionID: "sectionId", elementId: "sectionId",
  index: "position", blockType: "designId", post: "postId", postID: "postId", label: "navLabel", metaTitle: "seoTitle", metaDescription: "seoDescription",
  description: "seoDescription", hide: "hidden", hideFromMenu: "hidden", content: "blocks", body: "blocks", custom: "customSection",
  path: "slug", url: "slug", name: "title",
};
/** The one object each of these tools takes its changes in. Settings sent beside it belong inside it. */
const PAYLOAD: Record<string, string> = {
  update_theme: "patch", update_header: "header", update_footer: "props", update_section_props: "props", update_section_design: "design",
};
const camel = (key: string) => key.replace(/[_-]([a-z])/g, (_, letter: string) => letter.toUpperCase());

/**
 * A tool call's arguments with the tool's own parameter names: snake_case and
 * common other names are read as the real ones, objects written as JSON
 * strings are parsed, and settings sent beside the payload object (or without
 * it) are moved into it. `known` is the tool's parameter names.
 */
export function normalizeToolArgs(name: string, input: unknown, known: ReadonlySet<string>, notes?: string[]): unknown {
  const source = asRecord(input);
  if (!source) return input;
  const args: Json = {};
  for (const [key, value] of Object.entries(source)) {
    // A bare id is the id of whatever the tool works on.
    const names = key === "id" ? ["sectionId", "postId", "pageId"] : [camel(key), lookup(PARAMETERS, key), lookup(PARAMETERS, camel(key))];
    const target = names.find((candidate) => candidate && candidate !== key && known.has(candidate) && !(candidate in source));
    args[!known.has(key) && target ? target : key] = value;
  }
  if (typeof args.design === "string" && known.has("designId") && !known.has("design")) rename(args, "designId", "design");
  for (const key of ["props", "design", "patch", "header", "customSection"]) {
    if (typeof args[key] === "string" && known.has(key)) args[key] = asRecord(args[key]) ?? args[key];
  }
  // A custom layout written straight into the call.
  if (known.has("customSection") && args.customSection === undefined && args.designId === undefined && (args.rows !== undefined || args.columns !== undefined)) {
    args.customSection = Object.fromEntries(Object.entries(args).filter(([key]) => !known.has(key)));
    for (const key of Object.keys(args.customSection as Json)) delete args[key];
  }
  const payload = lookup(PAYLOAD, name) ?? (known.has("props") && args.designId !== undefined ? "props" : undefined);
  const stray = Object.keys(args).filter((key) => !known.has(key));
  if (payload && stray.length) {
    const inside = isRecord(args[payload]) ? args[payload] : {};
    args[payload] = { ...Object.fromEntries(stray.map((key) => [key, args[key]])), ...inside };
    for (const key of stray) delete args[key];
  } else {
    for (const key of stray) {
      delete args[key];
      addNote(notes, `${key} is not a parameter of ${name} and was ignored.`);
    }
  }
  return args;
}

/** One section of create_page: a curated design with optional content, or a custom layout. */
function normalizePageSection(raw: unknown): unknown {
  const section = asRecord(raw);
  if (!section) return typeof raw === "string" ? { designId: raw } : raw;
  const next = { ...section };
  rename(next, "designId", "design_id", "id");
  if (typeof next.design === "string") rename(next, "designId", "design");
  rename(next, "customSection", "custom_section", "custom");
  if (next.customSection === undefined && next.designId === undefined && (next.rows !== undefined || next.columns !== undefined)) return { customSection: normalizeCustomSection(next) };
  if (next.customSection !== undefined) next.customSection = normalizeCustomSection(next.customSection);
  if (typeof next.props === "string") next.props = asRecord(next.props) ?? next.props;
  return next;
}

/**
 * Everything done to a tool call before its schema sees it: the tool's own
 * parameter names, then the shapes inside them.
 */
export function normalizeToolInput(name: string, input: unknown, known: ReadonlySet<string>, notes?: string[]): unknown {
  const args = normalizeToolArgs(name, input, known, notes);
  if (!isRecord(args)) return args;
  if (args.customSection !== undefined) args.customSection = normalizeCustomSection(args.customSection);
  if (known.has("blocks") && args.blocks !== undefined) args.blocks = normalizeBlogBlocks(args.blocks);
  if (name === "create_page") {
    const sections = asList(args.sections);
    args.sections = sections ? sections.map(normalizePageSection) : [];
    if (typeof args.title === "string") {
      // The address and menu label follow from the title when they are left out.
      args.slug ??= slugify(args.title);
      args.navLabel ??= args.title.trim().split(/\s+/).slice(0, 3).join(" ").slice(0, 40);
    }
    if (typeof args.slug === "string") args.slug = slugify(args.slug) || args.slug;
  }
  if (name === "plan" && typeof args.steps === "string") args.steps = args.steps.split(/\n+/).map((step) => step.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean);
  return args;
}
