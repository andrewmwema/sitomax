import { z } from "zod";
import { siteLinkSchema, safeLegacyHref, normalizeExternalUrl, resolveLink, type LinkContext, linkAttributes } from "@/lib/links";
import { CURATED_FONT_NAMES } from "@/lib/theme/fonts";
import { nearestContrast } from "@/lib/theme/contrast";
import type { Data } from "@puckeditor/core";

export const HEADER_LAYOUTS = [
  { id: "balanced", label: "Logo left · centered menu" },
  { id: "right", label: "Logo left · menu right" },
  { id: "stacked", label: "Centered logo · menu below" },
  { id: "split", label: "Split menu · centered logo" },
  { id: "topbar", label: "Contact bar · navigation" },
  { id: "contact", label: "Logo & contacts · menu below" },
  { id: "minimal", label: "Logo · menu button" },
  { id: "overlay", label: "Transparent · solid on scroll" },
] as const;
export const COMPACT_LAYOUTS = [
  { id: "left-toggle", label: "Menu left · logo center · action right" },
  { id: "right-toggle", label: "Logo left · menu right" },
  { id: "center-logo", label: "Logo center · menu right" },
] as const;
export type HeaderDevice = "desktop" | "tablet" | "mobile";
export function headerMigrationMissing(error: { code?: string; message?: string } | null) {
  return Boolean(error && ["42703", "PGRST204"].includes(error.code ?? "") &&
    /draft_header|published_header|page_versions\.header/i.test(error.message ?? ""));
}
const text = (max: number) => z.string().max(max);
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.");
const image = z.string().max(2000).refine(value => {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f]/.test(value) || value.startsWith("//")) return false;
  try {
    const url = new URL(value, "https://relative.invalid");
    return url.protocol === "https:" && !url.username && !url.password && (value.startsWith("/") || value.startsWith("https://"));
  } catch { return false; }
}, "Choose a secure image URL.");
const link = z.union([z.string().max(2000).refine(value => value === "" || safeLegacyHref(value) !== null, "Choose a safe link."), siteLinkSchema])
  .refine(value => typeof value === "string" || !["url", "file"].includes(value.type) ||
    (("url" in value) && normalizeExternalUrl(value.url) !== null), "Choose a safe link.");
const child = z.strictObject({ label: text(80).min(1), href: link });
const menuItem = child.extend({ children: z.array(child).max(12).default([]) });
const styleShape = {
  height: z.number().int().min(48).max(200).default(84),
  padding: z.number().int().min(0).max(80).default(24),
  paddingY: z.number().int().min(0).max(40).default(8),
  logoHeight: z.number().int().min(16).max(120).default(36),
  background: z.enum(["color", "gradient", "image", "transparent"]).default("color"),
  color: hex.default("#ffffff"),
  gradientTo: hex.default("#f1f5f9"),
  image: image.default(""),
  textColor: hex.default("#17202b"),
  hoverColor: hex.default("#4338ca"),
  scrollColor: hex.default("#ffffff"),
  panelColor: hex.default("#ffffff"),
  panelTextColor: hex.default("#17202b"),
  border: z.boolean().default(true),
  borderColor: hex.default("#e5e7eb"),
  shadow: z.boolean().default(false),
  blur: z.boolean().default(false),
  sticky: z.boolean().default(false),
  shrink: z.boolean().default(false),
  font: z.enum(CURATED_FONT_NAMES).default("Inter"),
  fontSize: z.number().int().min(12).max(24).default(14),
  weight: z.enum(["400", "500", "600", "700"]).default("500"),
  uppercase: z.boolean().default(false),
  letterSpacing: z.number().min(0).max(6).default(0),
  indicator: z.enum(["underline", "pill", "dot", "none"]).default("underline"),
  container: z.enum(["boxed", "full"]).default("boxed"),
  iconPosition: z.enum(["left", "right"]).default("right"),
  iconStyle: z.enum(["lines", "dots", "text"]).default("lines"),
  action: z.enum(["phone", "cta", "none"]).default("none"),
  panel: z.enum(["drawer-left", "drawer-right", "fullscreen", "dropdown"]).default("drawer-right"),
};
const desktop = z.strictObject({
  ...styleShape, layout: z.enum(HEADER_LAYOUTS.map(item => item.id)).default("balanced"),
});
// Optional defaulted Zod fields still materialize defaults. Device overrides
// and AI patches must leave genuinely absent settings absent.
const overrideShape = Object.fromEntries(Object.entries(styleShape).map(([key, schema]) =>
  [key, schema.removeDefault().optional()])) as {
    [K in keyof typeof styleShape]: z.ZodOptional<ReturnType<(typeof styleShape)[K]["removeDefault"]>>;
  };
const mobile = z.strictObject(overrideShape).extend({
  layout: z.enum(COMPACT_LAYOUTS.map(item => item.id)).default("right-toggle"),
});
const tablet = z.strictObject(overrideShape).extend({
  follow: z.enum(["desktop", "mobile"]).default("mobile"),
  layout: z.enum(COMPACT_LAYOUTS.map(item => item.id)).optional(),
}).refine(value => value.follow !== "desktop" || value.layout === undefined,
  { message: "Tablet follows the desktop layout. Follow mobile to choose a compact layout.", path: ["layout"] });
export const headerSchema = z.strictObject({
  version: z.literal(1).default(1),
  logo: z.strictObject({
    mode: z.enum(["text", "image"]).default("text"),
    text: text(100).default(""),
    image: image.default(""),
    href: link.default("/"),
  }).prefault({}),
  menu: z.strictObject({
    source: z.enum(["pages", "custom"]).default("pages"),
    items: z.array(menuItem).max(24).default([]),
  }).prefault({}),
  cta: z.strictObject({
    text: text(80).default("Get in touch"),
    href: link.default("/contact"),
    style: z.enum(["primary", "secondary", "outline"]).default("primary"),
  }).prefault({}),
  contactsInMenu: z.boolean().default(true),
  desktop: desktop.prefault({}),
  tablet: tablet.prefault({}),
  mobile: mobile.prefault({ height: 68, logoHeight: 28, padding: 16 }),
});
export type SiteHeaderData = z.infer<typeof headerSchema>;
export type HeaderRoot = {
  title?: string; __editorHeader?: SiteHeaderData; __expectedHeader?: unknown;
  hideHeader?: boolean; transparentHeader?: boolean;
  __legacyNavigation?: boolean;
};
export function editorHeader(data: Data) {
  const props: HeaderRoot | undefined = data.root.props;
  return props?.__editorHeader;
}
export type HeaderDesign = Omit<SiteHeaderData["desktop"], "layout"> & { layout: string };
export const headerPageSchema = z.object({
  hideHeader: z.boolean().optional(), transparentHeader: z.boolean().optional(),
  __legacyNavigation: z.boolean().optional(),
});
export const headerEditSchema = z.strictObject({
  device: z.enum(["desktop", "tablet", "mobile"]),
  settings: z.strictObject(overrideShape).extend({
    layout: z.enum([...HEADER_LAYOUTS.map(item => item.id), ...COMPACT_LAYOUTS.map(item => item.id)]).optional(),
    follow: z.enum(["desktop", "mobile"]).optional(),
  }),
});

export function defaultHeader(name = "", logo = ""): SiteHeaderData {
  return headerSchema.parse({ logo: { text: name.slice(0, 100), image: logo, mode: logo ? "image" : "text" } });
}
export function headerDesign(header: SiteHeaderData, device: HeaderDevice): HeaderDesign {
  const compact = { ...header.desktop, ...header.mobile,
    iconPosition: header.mobile.iconPosition ?? (header.mobile.layout === "left-toggle" ? "left" : "right") };
  if (device === "desktop") return header.desktop;
  if (device === "mobile") return compact;
  const { follow, ...overrides } = header.tablet;
  const inherited = follow === "desktop" ? header.desktop : compact;
  return { ...inherited, ...overrides,
    iconPosition: overrides.iconPosition ?? (overrides.layout === "left-toggle" ? "left" :
      overrides.layout ? "right" : inherited.iconPosition),
  };
}
export function editHeader(header: SiteHeaderData, raw: unknown): SiteHeaderData {
  const { device, settings } = headerEditSchema.parse(raw);
  const { layout, ...inherited } = header[device];
  const current = device === "tablet" && settings.follow && settings.follow !== header.tablet.follow
    ? inherited : { ...inherited, layout };
  return headerSchema.parse({ ...header, [device]: { ...current, ...settings } });
}
export function headerColors(design: HeaderDesign) {
  // Gradient stops cannot guarantee contrast over the interpolated colors;
  // use the configured solid backing, as for photos and transparent heroes.
  const backgrounds = [design.color];
  const foreground = nearestContrast(design.textColor, backgrounds)!;
  return {
    foreground,
    hover: nearestContrast(design.hoverColor, backgrounds) ?? foreground,
    panel: nearestContrast(design.panelTextColor, [design.panelColor])!,
    scrolled: nearestContrast(design.textColor, [design.scrollColor])!,
    scrollHover: nearestContrast(design.hoverColor, [design.scrollColor])!,
    backing: design.background === "gradient" ? design.color : undefined,
  };
}
type LegacyNavigation = { type: string; props?: Record<string, unknown> };
export function headerFromNavigation(props: Record<string, unknown>, businessName?: string): SiteHeaderData {
  return headerSchema.parse({
    logo: { text: businessName || (typeof props.businessName === "string" ? props.businessName.slice(0, 100) : ""), href: props.brandLink ?? "/" },
    menu: { source: "pages" },
    cta: { text: typeof props.buttonText === "string" ? props.buttonText.slice(0, 80) : "", href: props.buttonLink ?? "" },
    desktop: { layout: "right", ...(props.variant === "dark" ? { color: "#17202b", textColor: "#ffffff" } : {}) },
  });
}
/** Templates and non-legacy drafts are normalized to one site header. */
export function extractNavigation<T extends { content: LegacyNavigation[] }>(data: T, businessName?: string) {
  const navigation = data.content.find(item => item.type === "Navigation");
  return {
    data: { ...data, content: data.content.filter(item => item.type !== "Navigation") },
    header: navigation ? headerFromNavigation(navigation.props ?? {}, businessName) : undefined,
  };
}
export function resolveHeaderLink(value: unknown, context: LinkContext) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    const path = value.split(/[?#]/)[0];
    const preview = Object.values(context.pages).find(target =>
      target.includes("?preview=1") && target.split("?")[0].replace(/^\/s\/[^/]+/, "") === path);
    if (preview) {
      const target = new URL(preview, "https://relative.invalid");
      const original = new URL(value, "https://relative.invalid");
      original.searchParams.forEach((entry, key) => { if (key !== "preview") target.searchParams.append(key, entry); });
      target.hash = original.hash;
      value = `${target.pathname}${target.search}${target.hash}`;
    }
  }
  return resolveLink(value, context);
}
export function headerLink(value: unknown, context: LinkContext, activePath?: string) {
  const attrs = linkAttributes({ __resolved: true, ...resolveHeaderLink(value, context) });
  return { ...attrs, ...(attrs.href.split(/[?#]/)[0] === activePath ? { "aria-current": "page" as const } : {}) };
}
