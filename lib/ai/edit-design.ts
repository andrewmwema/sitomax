import { z } from "zod";
import { safeHexColor, safeUploadedVideoUrl, videoEmbedUrl, type BlockDesign } from "@/lib/sections/design";
import { contrastRatio, DEFAULT_COLORS, type SiteTheme } from "@/lib/theme/presets";
import { nearestContrast } from "@/lib/theme/contrast";
import { CURATED_FONT_NAMES } from "@/lib/theme/fonts";

const hex = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
const bounded = (min: number, max: number) => z.number().int().min(min).max(max);
const devices = <T extends z.ZodType>(value: T) => z.strictObject({
  desktop: value.optional(), tablet: value.optional(), mobile: value.optional(),
});
const spacing = z.strictObject({
  marginTop: bounded(0, 240), marginRight: bounded(0, 240), marginBottom: bounded(0, 240), marginLeft: bounded(0, 240),
  paddingTop: bounded(0, 240), paddingRight: bounded(0, 240), paddingBottom: bounded(0, 240), paddingLeft: bounded(0, 240),
}).partial();
const overlay = { overlayColor: hex.optional(), overlayOpacity: bounded(0, 80).optional() };
export const editMediaUrl = z.string().max(2000).refine((value) => {
  if (/^\/samples\/[\w.-]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.invalid").origin
      && !url.username && !url.password && url.pathname.startsWith("/storage/v1/object/public/site-assets/");
  } catch { return false; }
}, "Use an existing sample or site-library image.");

export const designPatchSchema = z.strictObject({
  background: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("none") }),
    z.strictObject({ type: z.literal("color"), color: hex }),
    z.strictObject({ type: z.literal("gradient"), from: hex, to: hex, angle: bounded(0, 360) }),
    z.strictObject({ type: z.literal("image"), images: z.array(editMediaUrl).min(1).max(8),
      focalX: bounded(0, 100).optional(), focalY: bounded(0, 100).optional(), ...overlay }),
    z.strictObject({ type: z.literal("video"), video: z.discriminatedUnion("source", [
      z.strictObject({ source: z.literal("url"), embedUrl: z.string().max(2000).refine((v) => !!videoEmbedUrl(v)), poster: editMediaUrl.optional() }),
      z.strictObject({ source: z.literal("upload"), uploadUrl: editMediaUrl.refine((v) => !!safeUploadedVideoUrl(v)), poster: editMediaUrl.optional() }),
    ]), ...overlay }),
  ]),
  spacing: devices(spacing),
  appearance: devices(z.strictObject({ backgroundColor: hex, textColor: hex,
    borderRadius: bounded(0, 48), align: z.enum(["left", "center", "right"]) }).partial()),
  settings: z.strictObject({ hideOnDesktop: z.boolean(), hideOnTablet: z.boolean(), hideOnMobile: z.boolean(), fullBleed: z.boolean() }).partial(),
  border: z.strictObject({ width: bounded(0, 8), color: hex, radius: bounded(0, 48) }).partial(),
  shadow: z.enum(["none", "soft", "medium", "strong"]),
  animation: z.strictObject({ trigger: z.enum(["none", "entrance", "scroll"]),
    type: z.enum(["fade", "fade-up", "fade-down", "slide-left", "slide-right", "zoom-in"]),
    duration: bounded(150, 2000), delay: bounded(0, 1500) }).partial(),
}).partial();

export const themePatchSchema = z.strictObject({
  colors: z.strictObject({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }).partial(),
  headingFont: z.enum(CURATED_FONT_NAMES), bodyFont: z.enum(CURATED_FONT_NAMES),
  radius: bounded(0, 48), buttonStyle: z.enum(["rounded", "square", "pill"]),
}).partial();

export function readableText(text: string, background: string) {
  if (contrastRatio(text, background) >= 4.5) return text;
  return nearestContrast(text, [background]) ?? text;
}

export function editTheme(theme: SiteTheme, patch: z.infer<typeof themePatchSchema>, warnings: Set<string>): SiteTheme {
  const next = { ...theme, ...patch, colors: { ...theme.colors, ...patch.colors } };
  const colors = { ...DEFAULT_COLORS, ...next.colors };
  const text = readableText(colors.text, colors.background);
  if (text !== colors.text) { next.colors.text = text; warnings.add("Theme text color was adjusted to meet WCAG AA contrast."); }
  return next;
}

export function editDesign(design: BlockDesign, patch: z.infer<typeof designPatchSchema>, theme: SiteTheme, warnings: Set<string>): BlockDesign {
  const next: BlockDesign = { ...design, ...patch, settings: { ...design.settings, ...patch.settings },
    border: { ...design.border, ...patch.border }, animation: { ...design.animation, ...patch.animation },
    appearance: { ...design.appearance }, spacing: { ...design.spacing } };
  const background = next.background;
  if (patch.background?.type === "gradient" && background?.from && background.to) {
    // Both endpoints must fit the same accessible foreground; otherwise soften one endpoint.
    const ink = readableText(theme.colors?.text ?? DEFAULT_COLORS.text, background.from);
    const sameSide = (contrastRatio("#000", background.from) > contrastRatio("#000", ink))
      === (contrastRatio("#000", background.to) > contrastRatio("#000", ink));
    if (!sameSide || contrastRatio(ink, background.to) < 4.5) {
      next.background = { ...background, to: background.from };
      warnings.add("Gradient endpoints were adjusted to keep the foreground readable.");
    }
  }
  if (patch.background?.type === "image" || patch.background?.type === "video") {
    next.background = { ...patch.background, overlayColor: "#000", overlayOpacity: 80 };
    next.textColor = "light";
    warnings.add("A dark overlay keeps white text readable over the media.");
  }
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    if (patch.spacing?.[device]) next.spacing![device] = { ...design.spacing?.[device], ...patch.spacing[device] };
    const appearance = { ...design.appearance?.[device], ...patch.appearance?.[device] };
    if (patch.background || patch.appearance?.desktop || patch.appearance?.[device]) {
      const base = next.appearance?.desktop;
      const surface = safeHexColor(appearance.backgroundColor ?? base?.backgroundColor)
        ?? (background?.type === "color" ? background.color : background?.type === "gradient" ? background.from : undefined);
      if (!surface && (background?.type === "image" || background?.type === "video")) {
        if (appearance.textColor && appearance.textColor !== "#fff") warnings.add("Section text was reset to white for contrast over media.");
        appearance.textColor = "#fff";
        next.textColor = "light";
        next.background = { ...background, overlayColor: "#000", overlayOpacity: 80 };
      } else if (surface || appearance.textColor || base?.textColor) {
        const bg = surface ?? theme.colors?.background ?? DEFAULT_COLORS.background;
        const wanted = appearance.textColor ?? base?.textColor ?? theme.colors?.text ?? DEFAULT_COLORS.text;
        const end = next.background?.type === "gradient" && !appearance.backgroundColor && !base?.backgroundColor ? next.background.to : undefined;
        const color = end && contrastRatio(wanted, end) < 4.5
          ? nearestContrast(wanted, [bg, end]) ?? readableText(wanted, bg) : readableText(wanted, bg);
        appearance.textColor = color;
        if (color !== wanted) warnings.add("Section text color was adjusted to meet WCAG AA contrast.");
      }
    }
    if (Object.keys(appearance).length) next.appearance![device] = appearance;
  }
  return next;
}
