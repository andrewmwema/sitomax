"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  assessContrast,
  bestContrastingTextColor,
} from "@/lib/theme/contrast";
import {
  normalizeDesign,
  safeHexColor,
  type BlockDesign,
  type DesignLevel,
  type NormalizedBackground,
  type NormalizedDesign,
} from "@/lib/sections/design";
import { BOX_MARGINS } from "@/lib/layout/guardrails";

/**
 * SectionShell wraps EVERY block and applies the shared "design"
 * controls: settings (full-bleed, anchor, per-device visibility),
 * style (background color / image slider / video, border, shadow,
 * text color), entrance/scroll animations and per-device spacing.
 *
 * All design values go through normalizeDesign() (strict validation
 * and clamping) before they touch the DOM — never raw CSS or HTML.
 */

const SHADOW_PRESETS = {
  soft: "0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 28px -14px rgba(15, 23, 42, 0.16)",
  medium: "0 2px 6px rgba(15, 23, 42, 0.08), 0 18px 44px -14px rgba(15, 23, 42, 0.24)",
  strong: "0 4px 12px rgba(15, 23, 42, 0.12), 0 28px 68px -16px rgba(15, 23, 42, 0.34)",
} as const;

const TEXT_SCHEMES = {
  light: {
    "--color-text": "#f8fafc",
    "--color-muted": "rgba(248, 250, 252, 0.8)",
    "--color-border": "rgba(248, 250, 252, 0.24)",
    // Light text means a dark/photo surface: accent (or white) primary
    // button and a white outline for the secondary button.
    "--btn-bg": "var(--color-cta-dark)",
    "--btn-fg": "var(--color-on-cta-dark)",
    "--btn-outline": "rgba(255, 255, 255, 0.85)",
    // Accent eyebrows can vanish against photos; go light instead.
    "--eyebrow-color": "rgba(248, 250, 252, 0.92)",
    color: "#f8fafc",
  },
  dark: {
    "--color-text": "#17202b",
    "--color-muted": "rgba(23, 32, 43, 0.72)",
    "--color-border": "rgba(23, 32, 43, 0.16)",
    "--btn-bg": "var(--color-primary)",
    "--btn-fg": "var(--color-on-primary)",
    "--btn-outline": "rgba(23, 32, 43, 0.3)",
    color: "#17202b",
  },
} as const;

/** Rotation interval for multi-image background sliders. */
const SLIDER_INTERVAL_MS = 6000;

export function SectionShell({
  design,
  isEditing = false,
  level = "section",
  dragRef,
  blockId,
  children,
}: {
  design?: BlockDesign;
  isEditing?: boolean;
  /** Rows, columns and elements of the custom layout system nest shells. */
  level?: DesignLevel;
  /** Puck's drag handle ref for `inline` components (layout system). */
  dragRef?: ((element: Element | null) => void) | null;
  blockId?: string;
  children: ReactNode;
}) {
  const normalized = normalizeDesign(design);
  const {
    fullBleed,
    anchorId,
    hide,
    background,
    border,
    shadow,
    textScheme,
    animation,
  } = normalized;

  const hasBackground = background.kind !== "none";
  const animated = animation !== null && !isEditing;

  const ref = useRef<HTMLDivElement>(null);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      dragRef?.(element);
    },
    [dragRef],
  );
  // false = visible. Set only by the IntersectionObserver so content is
  // always visible without JavaScript and in the editor.
  const [animHidden, setAnimHidden] = useState(false);

  useEffect(() => {
    if (!animated) return;
    const element = ref.current;
    if (!element) return;

    const trigger = animation.trigger;
    let seen = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setAnimHidden(false);
          if (trigger === "entrance" && seen) observer.disconnect();
          seen = true;
        } else {
          // Below the fold: hide so it can animate in. "scroll" also
          // re-hides after leaving so it animates every time.
          if (!seen || trigger === "scroll") setAnimHidden(true);
          seen = true;
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [animated, animation?.trigger]);

  const style: CSSProperties = {
    ...spacingVars(normalized),
    ...(hasBackground ? { "--section-bg-override": "transparent", "--shell-design-bg": "transparent" } : null),
    ...(textScheme
      ? {
          ...TEXT_SCHEMES[textScheme],
          "--shell-text-override": TEXT_SCHEMES[textScheme].color,
        }
      : null),
    ...(border
      ? {
          border: border.width > 0 ? `${border.width}px solid ${border.color}` : undefined,
          borderRadius: `var(--shell-radius, ${border.radius}px)`,
          overflow: border.radius > 0 ? "hidden" : undefined,
        }
      : null),
    ...(shadow ? { boxShadow: SHADOW_PRESETS[shadow] } : null),
    ...(animation
      ? {
          "--shell-anim-duration": `${animation.duration}ms`,
          "--shell-anim-delay": `${animation.delay}ms`,
        }
      : null),
  } as CSSProperties;
  const contentWidth = level === "section" ? design?.settings?.contentWidth : undefined;
  if (contentWidth === "narrow" || contentWidth === "normal" || contentWidth === "wide") {
    (style as Record<string, string | number | undefined>)["--section-content-width"] =
      { narrow: "720px", normal: "var(--container, 1200px)", wide: "1440px" }[contentWidth];
  }
  for (const [device, suffix] of Object.entries({ desktop: "d", tablet: "t", mobile: "m" }) as [keyof NonNullable<BlockDesign["appearance"]>, string][]) {
    const appearance = design?.appearance?.[device];
    if (!appearance) continue;
    const vars = style as Record<string, string | number | undefined>;
    const bg = safeHexColor(appearance.backgroundColor);
    const requestedColor = safeHexColor(appearance.textColor);
    const color = bg
      ? requestedColor && assessContrast(requestedColor, bg)?.passes
        ? requestedColor
        : bestContrastingTextColor([bg])
      : requestedColor;
    if (bg) vars[`--appearance-bg-${suffix}`] = bg;
    if (color) {
      vars[`--appearance-text-${suffix}`] = color;
      vars[`--appearance-muted-${suffix}`] = `color-mix(in srgb, ${color} 75%, transparent)`;
    }
    if (typeof appearance.borderRadius === "number" && Number.isFinite(appearance.borderRadius)) {
      vars[`--appearance-radius-${suffix}`] = `${Math.max(0, Math.min(48, appearance.borderRadius))}px`;
    }
    if (appearance.align && ["left", "center", "right"].includes(appearance.align)) {
      vars[`--appearance-align-${suffix}`] = appearance.align;
      vars[`--appearance-justify-${suffix}`] = { left: "flex-start", center: "center", right: "flex-end" }[appearance.align];
      // A width-capped box sits where its text is aligned (see boxAlignStyle).
      const [left, right] = BOX_MARGINS[appearance.align];
      vars[`--appearance-ml-${suffix}`] = left;
      vars[`--appearance-mr-${suffix}`] = right;
    }
  }
  // Unlike the --appearance values, these are not reset by nested shells: an
  // element with no alignment of its own takes its nearest container's.
  const ownAlign = (device: "desktop" | "tablet" | "mobile") => {
    const align = design?.appearance?.[device]?.align;
    return align === "left" || align === "center" || align === "right" ? align : undefined;
  };
  for (const [device, suffix] of [["desktop", "d"], ["tablet", "t"], ["mobile", "m"]] as const) {
    const align = ownAlign(device) ?? ownAlign("desktop");
    if (!align) continue;
    const vars = style as Record<string, string | number | undefined>;
    [vars[`--inherit-ml-${suffix}`], vars[`--inherit-mr-${suffix}`]] = BOX_MARGINS[align];
  }

  // Backgrounds/overlays need clipping even without a radius.
  if (hasBackground && style.overflow === undefined) style.overflow = "hidden";
  if (design?.appearance && Object.values(design.appearance).some((value) => value?.borderRadius)) style.overflow = "hidden";

  const nested = level !== "section";
  const classes = [
    "section-shell",
    nested ? `layout-shell layout-shell-${level}` : "",
    fullBleed || nested ? "" : "section-shell-contained",
    // In the editor, "hidden" sections stay visible but dimmed so they
    // can still be selected and edited.
    hide.mobile ? (isEditing ? "max-md:opacity-40" : "max-md:hidden") : "",
    hide.tablet ? (isEditing ? "md:max-lg:opacity-40" : "md:max-lg:hidden") : "",
    hide.desktop ? (isEditing ? "lg:opacity-40" : "lg:hidden") : "",
    animated ? `shell-anim shell-anim-${animation.type}` : "",
    animated && animHidden ? "shell-anim-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setRef} id={anchorId ?? undefined} data-editor-block={isEditing ? blockId : undefined}
      data-content-width={contentWidth === "narrow" || contentWidth === "normal" || contentWidth === "wide" ? contentWidth : undefined}
      data-section-align-d={level === "section" ? design?.appearance?.desktop?.align : undefined}
      data-section-align-t={level === "section" ? design?.appearance?.tablet?.align ?? design?.appearance?.desktop?.align : undefined}
      data-section-align-m={level === "section" ? design?.appearance?.mobile?.align ?? design?.appearance?.desktop?.align : undefined}
      className={`${classes} shell-responsive`} style={style}>
      {hasBackground ? (
        <SectionBackground background={background} isEditing={isEditing} />
      ) : null}
      <div aria-hidden="true" className="shell-responsive-background" />
      <div className="relative shell-body">{children}</div>
    </div>
  );
}

/** Inline CSS variables consumed by the .section-shell rules. */
function spacingVars(design: NormalizedDesign): Record<string, string> {
  const vars: Record<string, string> = {};
  const suffix = { desktop: "d", tablet: "t", mobile: "m" } as const;
  const keys = {
    marginTop: "mt",
    marginRight: "mr",
    marginBottom: "mb",
    marginLeft: "ml",
    paddingTop: "pt",
    paddingRight: "pr",
    paddingBottom: "pb",
    paddingLeft: "pl",
  } as const;
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    const box = design.spacing[device];
    if (!box) continue;
    for (const [property, short] of Object.entries(keys) as [
      keyof typeof keys,
      string,
    ][]) {
      const value = box[property];
      if (value !== undefined) {
        vars[`--shell-${short}-${suffix[device]}`] = `${value}px`;
      }
    }
  }
  return vars;
}

/* ------------------------------------------------------------------ */
/* Background layers                                                   */
/* ------------------------------------------------------------------ */

function SectionBackground({
  background,
  isEditing,
}: {
  background: Exclude<NormalizedBackground, { kind: "none" }>;
  isEditing: boolean;
}) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {background.kind === "color" ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: background.color }}
        />
      ) : null}
      {background.kind === "gradient" ? (
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` }} />
      ) : null}
      {background.kind === "image" ? (
        <ImageSlider
          images={background.images}
          focalX={background.focalX}
          focalY={background.focalY}
          isEditing={isEditing}
        />
      ) : null}
      {background.kind === "video" ? <VideoBackground background={background} /> : null}
      {(background.kind === "image" || background.kind === "video") &&
      background.overlay ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: background.overlay.color,
            opacity: background.overlay.opacity / 100,
          }}
        />
      ) : null}
    </div>
  );
}

/** One image, or an auto-rotating crossfade slider for several. */
function ImageSlider({
  images,
  focalX,
  focalY,
  isEditing,
}: {
  images: string[];
  focalX: number;
  focalY: number;
  isEditing: boolean;
}) {
  const [active, setActive] = useState(0);
  // Never rotate while editing, and stand still for reduced motion.
  const rotate = images.length > 1 && !isEditing;

  useEffect(() => {
    if (!rotate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActive((index) => (index + 1) % images.length),
      SLIDER_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [rotate, images.length]);

  return (
    <>
      {images.map((url, index) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${index}-${url}`}
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{
            objectPosition: `${focalX}% ${focalY}%`,
            opacity: index === active % images.length ? 1 : 0,
          }}
          loading={index === 0 ? "eager" : "lazy"}
        />
      ))}
    </>
  );
}

function VideoBackground({
  background,
}: {
  background: Extract<NormalizedBackground, { kind: "video" }>;
}) {
  return (
    // Container queries size the embed to cover the section.
    <div className="absolute inset-0" style={{ containerType: "size" }}>
      {background.poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={background.poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {background.fileUrl ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={background.fileUrl}
          poster={background.poster ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : background.embedUrl ? (
        <iframe
          src={background.embedUrl}
          title="Background video"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
          style={{
            // Cover the section while keeping 16:9 (no letterboxing).
            width: "max(100cqw, calc(100cqh * 16 / 9))",
            height: "max(100cqh, calc(100cqw * 9 / 16))",
          }}
          allow="autoplay; encrypted-media"
          referrerPolicy="no-referrer"
          tabIndex={-1}
        />
      ) : null}
    </div>
  );
}
