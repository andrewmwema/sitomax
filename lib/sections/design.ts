import { bestContrastingTextColor } from "@/lib/theme/contrast";
import { snapSpacing } from "@/lib/layout/spacing";

/**
 * The "design" object every block carries (SectionShell controls).
 * All values are client-authored and stored inside draft/published
 * data, so SectionShell never renders them raw: normalizeDesign()
 * strictly validates, whitelists and clamps everything first. Raw CSS
 * or HTML is never accepted — only typed, bounded values.
 */

export type DeviceId = "desktop" | "tablet" | "mobile";

/**
 * Where a design object lives. Designed blocks and layout Sections get
 * every control; rows, columns and elements get Style / Animation /
 * Spacing (no section settings, and no video backgrounds).
 */
export type DesignLevel = "section" | "row" | "column" | "element";

export type SpacingBox = {
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
};

export type BlockDesign = {
  /** Missing means v1; only newly authored catalog entries opt into v2. */
  designVersion?: 1 | 2;
  appearance?: Partial<Record<DeviceId, {
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: number;
    align?: "left" | "center" | "right";
  }>>;
  settings?: {
    contentWidth?: "narrow" | "normal" | "wide";
    sectionPadding?: "compact" | "normal" | "spacious";
    dividerStyle?: "none" | "subtle" | "line" | "accent";
    /** true (default) = background edge-to-edge; false = 1200px box. */
    fullBleed?: boolean;
    /** Anchor id for menu links, e.g. "pricing" → #pricing. */
    anchorId?: string;
    hideOnDesktop?: boolean;
    hideOnTablet?: boolean;
    hideOnMobile?: boolean;
  };
  background?: {
    type?: "none" | "color" | "gradient" | "pattern" | "image" | "video";
    color?: string;
    pattern?: "dots" | "grid" | "lines";
    from?: string;
    to?: string;
    angle?: number;
    /** 1 image = static; several = auto-rotating background slider. */
    images?: string[];
    /** Focal point in percent (0–100). */
    focalX?: number;
    focalY?: number;
    overlayColor?: string;
    /** 0–80 (%): keeps text readable over images and video. */
    overlayOpacity?: number;
    video?: {
      source?: "upload" | "url";
      /** Upload to the site-assets bucket (validated server-side). */
      uploadUrl?: string;
      /** YouTube / Vimeo page URL (allowlisted hosts only). */
      embedUrl?: string;
      poster?: string;
    };
  };
  border?: { width?: number; color?: string; radius?: number };
  shadow?: "none" | "soft" | "medium" | "strong";
  textColor?: "auto" | "light" | "dark";
  animation?: {
    trigger?: "none" | "entrance" | "scroll";
    type?: "fade" | "fade-up" | "fade-down" | "slide-left" | "slide-right" | "zoom-in";
    /** Milliseconds. */
    duration?: number;
    delay?: number;
  };
  spacing?: Partial<Record<DeviceId, SpacingBox>>;
};

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function safeHexColor(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function clamp(value: unknown, min: number, max: number): number | null {
  const amount = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(amount)) return null;
  return Math.min(max, Math.max(min, Math.round(amount)));
}

/** https-only media URL (uploaded images / posters / pasted URLs). */
export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) {
    return null;
  }
  try {
    const url = new URL(value, "https://placeholder.invalid");
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Uploaded background videos must be https .mp4/.webm files, and when
 * the Supabase URL is known, must live in our own storage.
 */
export function safeUploadedVideoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!/\.(mp4|webm)$/i.test(url.pathname)) return null;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (base) {
      try {
        if (url.host !== new URL(base).host) return null;
      } catch {
        /* unparsable env — fall through to generic https check */
      }
    }
    return value;
  } catch {
    return null;
  }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{6,12}$/;

type ParsedVideo = { provider: "youtube" | "vimeo"; videoId: string };

/**
 * SECURITY: parses a user-pasted video URL. Only youtube.com / youtu.be /
 * vimeo.com (and their embed hosts) with well-formed ids are accepted;
 * anything else (javascript:, data:, other hosts) returns null.
 */
function parseVideoUrl(raw: unknown): ParsedVideo | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;
  let provider: "youtube" | "vimeo" | null = null;

  if (host === "youtube.com" || host === "m.youtube.com") {
    provider = "youtube";
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const match = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(url.pathname);
      videoId = match?.[1] ?? null;
    }
  } else if (host === "youtube-nocookie.com") {
    provider = "youtube";
    videoId = /^\/embed\/([^/?]+)/.exec(url.pathname)?.[1] ?? null;
  } else if (host === "youtu.be") {
    provider = "youtube";
    videoId = url.pathname.slice(1).split("/")[0] || null;
  } else if (host === "vimeo.com") {
    provider = "vimeo";
    videoId = /^\/(\d+)/.exec(url.pathname)?.[1] ?? null;
  } else if (host === "player.vimeo.com") {
    provider = "vimeo";
    videoId = /^\/video\/(\d+)/.exec(url.pathname)?.[1] ?? null;
  }

  if (!provider || !videoId) return null;
  if (provider === "youtube" && !YOUTUBE_ID.test(videoId)) return null;
  if (provider === "vimeo" && !VIMEO_ID.test(videoId)) return null;
  return { provider, videoId };
}

/**
 * Background-video embed URL (autoplay, muted, looping, no controls).
 * YouTube renders via youtube-nocookie.com, Vimeo with dnt=1.
 */
export function videoEmbedUrl(raw: unknown): string | null {
  const video = parseVideoUrl(raw);
  if (!video) return null;
  const { provider, videoId } = video;

  if (provider === "youtube") {
    const params = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      controls: "0",
      loop: "1",
      playlist: videoId,
      playsinline: "1",
      rel: "0",
      modestbranding: "1",
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
  }

  const params = new URLSearchParams({
    background: "1",
    autoplay: "1",
    muted: "1",
    loop: "1",
    dnt: "1",
  });
  return `https://player.vimeo.com/video/${videoId}?${params}`;
}

/** Regular player embed URL (with controls) for the Video element. */
export function videoPlayerUrl(
  raw: unknown,
  options: { autoplay?: boolean } = {},
): string | null {
  const video = parseVideoUrl(raw);
  if (!video) return null;
  const { provider, videoId } = video;

  if (provider === "youtube") {
    const params = new URLSearchParams({ rel: "0", playsinline: "1" });
    // Browsers only allow muted autoplay.
    if (options.autoplay) {
      params.set("autoplay", "1");
      params.set("mute", "1");
    }
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
  }
  const params = new URLSearchParams({ dnt: "1" });
  if (options.autoplay) {
    params.set("autoplay", "1");
    params.set("muted", "1");
  }
  return `https://player.vimeo.com/video/${videoId}?${params}`;
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

export type NormalizedOverlay = { color: string; opacity: number } | null;

export type NormalizedBackground =
  | { kind: "none" }
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "pattern"; pattern: "dots" | "grid" | "lines" }
  | {
      kind: "image";
      images: string[];
      focalX: number;
      focalY: number;
      overlay: NormalizedOverlay;
    }
  | {
      kind: "video";
      embedUrl: string | null;
      fileUrl: string | null;
      poster: string | null;
      overlay: NormalizedOverlay;
    };

export type NormalizedDesign = {
  designVersion: 1 | 2;
  fullBleed: boolean;
  anchorId: string | null;
  sectionPadding: "compact" | "normal" | "spacious";
  dividerStyle: "none" | "subtle" | "line" | "accent";
  hide: Record<DeviceId, boolean>;
  background: NormalizedBackground;
  border: { width: number; color: string; radius: number } | null;
  shadow: "soft" | "medium" | "strong" | null;
  /** Resolved text scheme ("auto" already computed), or null = theme. */
  textScheme: "light" | "dark" | null;
  animation: {
    trigger: "entrance" | "scroll";
    type: AnimationType;
    duration: number;
    delay: number;
  } | null;
  spacing: Partial<Record<DeviceId, SpacingBox>>;
};

const SHADOWS = ["soft", "medium", "strong"] as const;
const ANIMATION_TYPES = [
  "fade",
  "fade-up",
  "fade-down",
  "slide-left",
  "slide-right",
  "zoom-in",
] as const;

export type AnimationType = (typeof ANIMATION_TYPES)[number];

const DARK_INK = "#17202b";

/** Light or dark text for a hex background, 4.5:1 contrast first. */
export function autoTextScheme(backgroundColor: string): "light" | "dark" {
  return bestContrastingTextColor([backgroundColor], ["#f8fafc", DARK_INK]) === "#f8fafc"
    ? "light"
    : "dark";
}

function normalizeOverlay(
  background: NonNullable<BlockDesign["background"]>,
  enforceContrast: boolean,
): NormalizedOverlay {
  const opacity = clamp(background.overlayOpacity, 0, 80) ?? 0;
  if (enforceContrast) {
    return { color: "#0a0e14", opacity: Math.max(60, opacity) };
  }
  const color = safeHexColor(background.overlayColor) ?? "#0a0e14";
  if (opacity === 0) return null;
  return { color, opacity };
}

function normalizeSpacingBox(box: unknown): SpacingBox | undefined {
  if (!box || typeof box !== "object") return undefined;
  const source = box as Record<string, unknown>;
  const result: SpacingBox = {};
  for (const key of [
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ] as const) {
    // Guardrail: every value snaps to the spacing scale (0–128px).
    const raw = source[key];
    if (typeof raw === "number" && Number.isFinite(raw)) result[key] = snapSpacing(raw);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Validates and clamps a stored design object into safe render values. */
export function normalizeDesign(design: BlockDesign | null | undefined): NormalizedDesign {
  const settings = design?.settings ?? {};
  const designVersion: 1 | 2 = design?.designVersion === 2 ? 2 : 1;
  const sectionPadding = ["compact", "normal", "spacious"].includes(settings.sectionPadding ?? "")
    ? settings.sectionPadding as "compact" | "normal" | "spacious"
    : "normal";
  const dividerStyle = ["none", "subtle", "line", "accent"].includes(settings.dividerStyle ?? "")
    ? settings.dividerStyle as "none" | "subtle" | "line" | "accent"
    : "none";
  const autoText = design?.textColor === undefined || design.textColor === "auto";
  const enforceMediaContrast = designVersion === 2 && autoText;
  const rawAnchor =
    typeof settings.anchorId === "string"
      ? settings.anchorId.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]/g, "").slice(0, 60)
      : "";

  let background: NormalizedBackground = { kind: "none" };
  const rawBackground = design?.background;
  if (rawBackground) {
    if (rawBackground.type === "color") {
      const color = safeHexColor(rawBackground.color);
      if (color) background = { kind: "color", color };
    } else if (rawBackground.type === "gradient") {
      const from = safeHexColor(rawBackground.from), to = safeHexColor(rawBackground.to);
      if (from && to) background = { kind: "gradient", from, to, angle: clamp(rawBackground.angle, 0, 360) ?? 135 };
    } else if (rawBackground.type === "pattern") {
      if (rawBackground.pattern === "dots" || rawBackground.pattern === "grid" || rawBackground.pattern === "lines") {
        background = { kind: "pattern", pattern: rawBackground.pattern };
      }
    } else if (rawBackground.type === "image") {
      const images = (Array.isArray(rawBackground.images) ? rawBackground.images : [])
        .map(safeMediaUrl)
        .filter((url): url is string => url !== null)
        .slice(0, 8);
      if (images.length > 0) {
        background = {
          kind: "image",
          images,
          focalX: clamp(rawBackground.focalX, 0, 100) ?? 50,
          focalY: clamp(rawBackground.focalY, 0, 100) ?? 50,
          overlay: normalizeOverlay(rawBackground, enforceMediaContrast),
        };
      }
    } else if (rawBackground.type === "video") {
      const video = rawBackground.video ?? {};
      const embedUrl =
        video.source !== "upload" ? videoEmbedUrl(video.embedUrl) : null;
      const fileUrl =
        video.source === "upload" ? safeUploadedVideoUrl(video.uploadUrl) : null;
      const poster = safeMediaUrl(video.poster);
      // A poster alone still renders (as a static image) so video
      // designs look finished before a video is added.
      if (embedUrl || fileUrl || poster) {
        background = {
          kind: "video",
          embedUrl,
          fileUrl,
          poster,
          overlay: normalizeOverlay(rawBackground, enforceMediaContrast),
        };
      }
    }
  }

  let border: NormalizedDesign["border"] = null;
  if (design?.border) {
    const width = clamp(design.border.width, 0, 8) ?? 0;
    const radius = clamp(design.border.radius, 0, 48) ?? 0;
    if (width > 0 || radius > 0) {
      border = {
        width,
        radius,
        color: safeHexColor(design.border.color) ?? "#d4d4d8",
      };
    }
  }

  const shadow = SHADOWS.includes(design?.shadow as (typeof SHADOWS)[number])
    ? (design?.shadow as "soft" | "medium" | "strong")
    : null;

  let textScheme: "light" | "dark" | null = null;
  if (design?.textColor === "light" || design?.textColor === "dark") {
    textScheme = design.textColor;
  } else if (design?.textColor === "auto" || design?.textColor === undefined) {
    if (background.kind === "color") {
      textScheme = autoTextScheme(background.color);
    } else if (background.kind === "gradient") {
      textScheme = bestContrastingTextColor(
        [background.from, background.to],
        ["#f8fafc", DARK_INK],
      ) === "#f8fafc" ? "light" : "dark";
    } else if (background.kind === "image" || background.kind === "video") {
      textScheme = enforceMediaContrast
        ? "light"
        : background.overlay && background.overlay.opacity >= 30
          ? autoTextScheme(background.overlay.color)
          : "light";
    }
  }

  let animation: NormalizedDesign["animation"] = null;
  const rawAnimation = design?.animation;
  if (
    rawAnimation &&
    (rawAnimation.trigger === "entrance" || rawAnimation.trigger === "scroll") &&
    ANIMATION_TYPES.includes(rawAnimation.type as (typeof ANIMATION_TYPES)[number])
  ) {
    animation = {
      trigger: rawAnimation.trigger,
      type: rawAnimation.type as AnimationType,
      duration: clamp(rawAnimation.duration, 100, 3000) ?? 600,
      delay: clamp(rawAnimation.delay, 0, 2000) ?? 0,
    };
  }

  const spacing: NormalizedDesign["spacing"] = {};
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    const box = normalizeSpacingBox(design?.spacing?.[device]);
    if (box) spacing[device] = box;
  }

  return {
    designVersion,
    fullBleed: settings.fullBleed !== false,
    anchorId: rawAnchor.length > 0 ? rawAnchor : null,
    sectionPadding,
    dividerStyle,
    hide: {
      desktop: settings.hideOnDesktop === true,
      tablet: settings.hideOnTablet === true,
      mobile: settings.hideOnMobile === true,
    },
    background,
    border,
    shadow,
    textScheme,
    animation,
    spacing,
  };
}
