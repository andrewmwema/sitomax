"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Render } from "@puckeditor/core";
import { toPng } from "html-to-image";
import { puckConfig } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import type { SectionDesign } from "@/lib/sections/catalog";

/**
 * Gallery thumbnail for a section design. The design renders live at
 * 1280px wide (desktop layout) scaled down to the card, in the current
 * site theme. After the first paint it is captured to a PNG and cached,
 * so reopening the gallery shows a cheap <img> instead of live DOM.
 * Saved designs with a stored screenshot use it directly.
 */

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 920;

/** Data-URL cache, keyed by design + theme so restyling re-renders. */
const thumbnailCache = new Map<string, string>();

export function DesignThumbnail({
  design,
  theme,
}: {
  design: SectionDesign;
  theme: SiteTheme;
}) {
  const cacheKey = useMemo(
    () => `${design.id}:${JSON.stringify(theme)}`,
    [design.id, theme],
  );

  const [imageUrl, setImageUrl] = useState<string | null>(
    () => design.thumbnail ?? thumbnailCache.get(cacheKey) ?? null,
  );
  const [scale, setScale] = useState(0.2);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  // Render-time adjustment (not an effect): re-resolve the cached image
  // when the design or theme changes.
  const [lastKey, setLastKey] = useState(cacheKey);
  if (lastKey !== cacheKey) {
    setLastKey(cacheKey);
    setImageUrl(design.thumbnail ?? thumbnailCache.get(cacheKey) ?? null);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) setScale(el.clientWidth / RENDER_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (imageUrl) return;
    const node = liveRef.current;
    if (!node) return;
    let cancelled = false;
    // Give fonts/images a moment to settle before the one-off capture.
    const timer = window.setTimeout(() => {
      toPng(node, {
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        canvasWidth: 512,
        canvasHeight: Math.round((512 * RENDER_HEIGHT) / RENDER_WIDTH),
        pixelRatio: 1,
        style: { transform: "none" },
      })
        .then((dataUrl) => {
          if (cancelled) return;
          thumbnailCache.set(cacheKey, dataUrl);
          setImageUrl(dataUrl);
        })
        .catch(() => {
          // Capture can fail (e.g. cross-origin images): keep the live
          // scaled preview, which is always correct.
        });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cacheKey, imageUrl]);

  const data = useMemo(
    () => ({
      root: { props: {} },
      content: [
        {
          type: design.blockType,
          props: {
            ...(puckConfig.components[
              design.blockType as keyof typeof puckConfig.components
            ]?.defaultProps ?? {}),
            ...design.props,
            id: `thumbnail-${design.id}`,
          },
        },
      ],
    }),
    [design],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-white"
      style={{ aspectRatio: `${RENDER_WIDTH} / ${RENDER_HEIGHT}` }}
    >
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt={design.name}
          className="absolute inset-0 h-full w-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        <div
          ref={liveRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 select-none"
          style={{
            width: RENDER_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <Render
            config={puckConfig}
            // Cast: a single-block preview fragment, not a full page.
            data={data as never}
            metadata={{ theme }}
            // Same as the public renderer: RichTextContent sanitizes.
            fieldTransforms={{ richtext: ({ value }) => value }}
          />
        </div>
      )}
    </div>
  );
}
