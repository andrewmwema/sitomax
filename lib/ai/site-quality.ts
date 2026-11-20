import { safeHref } from "@/lib/layout/guardrails";
import { defaultMenuLabel, menuLabelSchema } from "@/lib/page-navigation";
import type { Business } from "@/lib/business";
import { assessContrast, resolveContrastBackgrounds } from "@/lib/theme/contrast";
import { buildThemeStyle, DEFAULT_COLORS, type SiteTheme } from "@/lib/theme/presets";
import { normalizeDesign, type BlockDesign } from "@/lib/sections/design";

type ReviewPage = { slug: string; nav_label?: string | null };
type ReviewItem = { type: string; props: Record<string, unknown> };
type Options = { slug: string; pages: ReviewPage[]; business: Business; theme?: SiteTheme };
const slotKeys = ["rows", "columns", "content"] as const;
const copyKeys = new Set(["text", "heading", "title", "subtitle", "description", "label", "tagline", "note", "value"]);
const linkKeys = /^(href|url|.*Link|link)$/;
const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;|[\u200b-\u200f\ufeff]/gi, " ").trim();

export function reviewGeneratedPage(content: ReviewItem[], { slug, pages, business, theme }: Options) {
  const notes: string[] = [];
  const label = menuLabelSchema.safeParse(pages.find((page) => page.slug === slug)?.nav_label).data ?? defaultMenuLabel(slug);
  const note = (message: string) => notes.push(`${label}: ${message}`);
  const paths = new Set(pages.map((page) => `/${page.slug}`));
  const anchors = new Set<string>();
  const scanAnchors = (items: ReviewItem[]) => items.forEach(({ type, props }) => {
    if (type === "ContactForm") anchors.add("#contact");
    const anchor = normalizeDesign(props.design as BlockDesign | undefined).anchorId;
    if (anchor) anchors.add(`#${anchor}`);
    for (const key of slotKeys) if (Array.isArray(props[key])) scanAnchors(props[key] as ReviewItem[]);
  });
  scanAnchors(content);
  let emptyText = 0, brokenLinks = 0, placeholders = 0, missingAlt = 0, duplicates = 0, contactMismatches = 0, contrastIssues = 0;
  const colors = { ...DEFAULT_COLORS, ...theme?.colors };
  const { "--color-dark-bg": darkBackground } = buildThemeStyle(theme) as { "--color-dark-bg": string };
  const reviewColors = (items: ReviewItem[], surfaces: readonly string[]) => items.forEach(({ type, props }) => {
    const design = props.design as { appearance?: Record<string, { textColor?: unknown }> } | undefined;
    const token = props.background;
    const base = type === "Column" && (props.surface === "card" || props.surface === "highlight") ? [colors.background]
      : token === "primary" ? [colors.primary]
        : token === "dark" ? [darkBackground]
          : token === "default" ? [colors.background] : surfaces;
    const active = resolveContrastBackgrounds(design, base);
    if (Object.values(design?.appearance ?? {}).some(({ textColor }) =>
      active.some((background) => assessContrast(textColor, background)?.passes === false))) contrastIssues++;
    for (const key of slotKeys) if (Array.isArray(props[key])) reviewColors(props[key] as ReviewItem[], active);
  });
  const checkLink = (value: string) => {
    if (/[\\\u0000-\u001f]/.test(value) || /\[[^\]]+\]|\{\{[^}]+\}\}/.test(value)) return "";
    const href = safeHref(value);
    if (href === "#" || (href.startsWith("#") && !anchors.has(href)) ||
      (href.startsWith("/") && !paths.has(href.split(/[?#]/)[0]))) return "";
    if (/^mailto:/i.test(href) && href.slice(7).toLowerCase() !== business.email.toLowerCase()) return "";
    if (/^tel:/i.test(href) && href.slice(4).replace(/[^\d+]/g, "") !== business.phone.replace(/[^\d+]/g, "")) return "";
    return href;
  };
  const auditProps = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["design", "id", "photoCredits", ...slotKeys].includes(key)) continue;
      if (child && typeof child === "object") { auditProps(child); continue; }
      if (typeof child !== "string") continue;
      if (copyKeys.has(key)) {
        placeholders += (plain(child).match(/\[[^[\]]+\]|\{\{[^{}]+\}\}/g) ?? []).length;
        const emails = plain(child).match(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi) ?? [];
        if (emails.some((email) => email.toLowerCase() !== business.email.toLowerCase())) contactMismatches++;
        const phones = plain(child).match(/(?:\+\d[\d ().-]{6,}\d|\(\d{2,4}\) *\d[\d .-]{5,}\d|\b\d{3}[- .]\d{3}[- .]\d{4}\b)/g) ?? [];
        if (phones.some((phone) => phone.replace(/\D/g, "") !== business.phone.replace(/\D/g, ""))) contactMismatches++;
        const contactField = plain(child).match(/^(address|(?:opening )?hours)\s*:\s*(.+)$/i);
        if (contactField && contactField[2].trim() !== (/address/i.test(contactField[1]) ? business.address : business.openingHours)) contactMismatches++;
      }
      if (linkKeys.test(key) && child && !checkLink(child)) brokenLinks++;
    }
    if (!Array.isArray(value)) {
      const props = value as Record<string, unknown>;
      for (const [key, child] of Object.entries(props)) {
        if (typeof child === "string" && child && /^(image|.*Image|src)$/.test(key) && !["socialImage"].includes(key)) {
          const alt = props[key === "src" ? "alt" : `${key}Alt`];
          if (typeof alt !== "string" || !alt.trim()) missingAlt++;
        }
      }
    }
  };

  const fingerprint = (item: ReviewItem) => JSON.stringify(item, (key, value) =>
    key === "id" || key === "photoCredits" ? undefined : value);
  const seen = new Set<string>();
  let headings = 0, lastHeading = 1;
  const normalizeCopy = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/<(\/?)h1(?=[\s>])/gi, "<$1h2");
    if (Array.isArray(value)) return value.map(normalizeCopy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeCopy(child)]));
    return value;
  };
  const clean = (items: ReviewItem[], top = false): ReviewItem[] => items.flatMap((item) => {
    const { type, props: original } = item;
    const props = { ...original };
    if (top) {
      const signature = fingerprint(item);
      if (seen.has(signature)) { duplicates++; return []; }
      seen.add(signature);
    }
    for (const key of slotKeys) if (Array.isArray(props[key])) {
      const children = clean(props[key] as ReviewItem[]);
      if (!children.length) return [];
      props[key] = children;
    }
    for (const key of Object.keys(props)) {
      if (!["design", "id", "photoCredits", ...slotKeys].includes(key)) props[key] = normalizeCopy(props[key]);
    }
    if ((type === "Heading" || type === "Text") && !plain(String(props.text ?? ""))) { emptyText++; return []; }
    if (type === "Heading") {
      const requested = Number(String(props.level ?? "h2").slice(1)) || 2;
      const level = headings++ === 0 ? 1 : Math.max(2, Math.min(requested, lastHeading + 1));
      props.level = `h${level}`;
      lastHeading = level;
    }
    if (type === "Text") {
      const asLink = plain(String(props.text)).match(/^([^:\n]{1,60}):\s*((?:https?:\/\/|mailto:|tel:|\/|#)\S+)$/i);
      if (asLink) {
        const href = checkLink(asLink[2]);
        if (href) {
          props.label = asLink[1].trim();
          props.href = href;
          delete props.text;
          const { id, design, align } = props;
          return [{ type: "Button", props: { label: props.label, href, id, design, align, variant: "ghost", size: "md", newTab: false } }];
        }
        brokenLinks++;
        delete props.text;
        return [];
      }
    }
    if (type === "Button" && (typeof props.href !== "string" || !checkLink(props.href))) {
      brokenLinks++;
      return [];
    }
    auditProps(props);
    if (type === "Hero" || type === "TextSection") {
      for (const prefix of ["button", "secondaryButton"]) {
        const href = props[`${prefix}Link`];
        if (typeof href === "string" && href && !checkLink(href)) {
          props[`${prefix}Link`] = "";
          props[`${prefix}Text`] = "";
        }
      }
    }
    if (type === "Navigation" || type === "Footer" || type === "ContactForm") {
      // These render contact details and menus from site metadata, not AI props.
      for (const key of ["phone", "address", "email", "hours"] as const) {
        if (props[key] && props[key] !== business[key === "hours" ? "openingHours" : key]) contactMismatches++;
        if (key in props) props[key] = "";
      }
      if (type === "ContactForm" && Array.isArray(props.details) && props.details.length) {
        contactMismatches++;
        props.details = [];
      }
      if (type === "Footer") props.navigation = [];
    }
    return [{ ...item, props }];
  });
  const reviewed = clean(content, true);
  reviewColors(reviewed, [colors.background]);
  if (pages.some((page) => page.nav_label != null && !menuLabelSchema.safeParse(page.nav_label).success)) note("An invalid menu label was replaced with its short slug label.");
  if (emptyText) note(`${emptyText} empty or invisible text block(s) removed.`);
  if (duplicates) note(`${duplicates} duplicate section(s) removed.`);
  if (brokenLinks) note(`${brokenLinks} broken or placeholder link(s) detected; check link destinations before publishing.`);
  if (contactMismatches) note(`${contactMismatches} contact detail(s) need review against Business information. Menus and contact blocks use the saved details.`);
  if (missingAlt) note(`${missingAlt} image(s) need descriptive alt text.`);
  if (contrastIssues) note(`${contrastIssues} block(s) had low-contrast color choices. Review the adjusted colors in the inspector.`);
  if (placeholders) note(`${placeholders} placeholder(s) remain on this page.`);
  return { content: reviewed, notes };
}

export function generatedPageIssues(content: ReviewItem[]) {
  let h1 = 0, words = 0, actions = 0, footers = 0;
  const countCopy = (value: unknown): number => {
    if (!value || typeof value !== "object") return 0;
    return Object.entries(value).reduce((total, [key, child]) => {
      if (["design", "id", "photoCredits", ...slotKeys].includes(key)) return total;
      if (typeof child === "object") return total + countCopy(child);
      if (typeof child !== "string" || !["text", "description", "subheading", "answer"].includes(key)) return total;
      return total + (plain(child.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, ""))
        .replace(/\[[^\]]+\]|\{\{[^}]+\}\}/g, "").match(/[\p{L}\p{N}]+/gu)?.length ?? 0);
    }, 0);
  };
  const visit = (items: ReviewItem[]) => items.forEach(({ type, props }) => {
    if (type === "Footer") { footers++; return; }
    if (type === "Navigation") return;
    if (type === "Heading") {
      if (props.level === "h1" && plain(String(props.text ?? ""))) h1++;
    } else {
      const copy = type === "Hero" ? { subheading: props.subheading }
        : type === "TextSection" || type === "ContactForm" ? { text: props.text } : props;
      words += countCopy(copy);
    }
    if (type === "Hero" && plain(String(props.heading ?? ""))) h1++;
    if (type === "Button" && props.label && props.href) actions++;
    if ((type === "Hero" || (type === "TextSection" && props.variant === "cta"))
      && ((props.buttonText && props.buttonLink) || (props.secondaryButtonText && props.secondaryButtonLink))) actions++;
    if ((type === "ContactForm" || (type === "Hero" && props.variant === "lead-form"))
      && props.formName && Array.isArray(props.formFields) && props.formFields.length) actions++;
    for (const key of slotKeys) if (Array.isArray(props[key])) visit(props[key] as ReviewItem[]);
  });
  visit(content);
  return [
    ...(h1 !== 1 ? ["Use exactly one nonempty H1 page heading."] : []),
    ...(words < 30 ? ["Write at least 30 words of substantive supporting copy, excluding headings, menus and placeholders."] : []),
    ...(!actions ? ["Include a working next-step button or contact form in the page body."] : []),
    ...(footers !== 1 || content.at(-1)?.type !== "Footer" ? ["End the page with exactly one shared Footer."] : []),
  ];
}
