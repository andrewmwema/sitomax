"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  normalizeDesign,
  type BlockDesign,
  type NormalizedBackground,
  type NormalizedDesign,
} from "@/lib/sections/design";

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
    color: "#f8fafc",
  },
  dark: {
    "--color-text": "#17202b",
    "--color-muted": "rgba(23, 32, 43, 0.72)",
    "--color-border": "rgba(23, 32, 43, 0.16)",
    color: "#17202b",
  },
} as const;

/** Rotation interval for multi-image background sliders. */
const SLIDER_INTERVAL_MS = 6000;

export function SectionShell({
  design,
  isEditing = false,
  children,
}: {
  design?: BlockDesign;
  isEditing?: boolean;
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
    ...(hasBackground ? { "--section-bg-override": "transparent" } : null),
    ...(textScheme ? TEXT_SCHEMES[textScheme] : null),
    ...(border
      ? {
          border: border.width > 0 ? `${border.width}px solid ${border.color}` : undefined,
          borderRadius: border.radius > 0 ? border.radius : undefined,
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

  // Backgrounds/overlays need clipping even without a radius.
  if (hasBackground && style.overflow === undefined) style.overflow = "hidden";

  const classes = [
    "section-shell",
    fullBleed ? "" : "section-shell-contained",
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
    <div ref={ref} id={anchorId ?? undefined} className={classes} style={style}>
      {hasBackground ? (
        <SectionBackground background={background} isEditing={isEditing} />
      ) : null}
      <div className="relative">{children}</div>
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
