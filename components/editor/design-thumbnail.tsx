"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Render } from "@puckeditor/core";
import { toPng } from "html-to-image";
import { puckConfig } from "@/lib/puck/config";
import { buildThemeStyle, type SiteTheme } from "@/lib/theme/presets";
import { fontVariables } from "@/lib/theme/fonts";
import type { SectionDesign } from "@/lib/sections/catalog";

/**
 * Gallery thumbnail for a section design. The design renders live at a
 * fixed 1280px viewport inside a sandboxed <iframe> (no scripts), scaled
 * down with transform: scale(cardWidth / 1280) from the top-left — the
 * full width is always visible (nothing cropped horizontally) and tall
 * sections are cropped from the top of the card downward. The card
 * height adapts to the content (capped), so there is no empty space.
 *
 * The iframe document receives everything the real page has: the app's
 * compiled stylesheets (kept in sync with a MutationObserver, since dev
 * HMR injects styles after mount), the next/font variable classes on
 * its <body>, and the site theme CSS variables on its root. Content is
 * measured after the iframe's fonts load (document.fonts.ready).
 *
 * After the first settled paint the preview is captured to a PNG and
 * cached, so reopening the gallery shows a cheap <img>.
 */

const RENDER_WIDTH = 1280;
/** Tallest content slice (in 1280px-viewport pixels) a card shows. */
const MAX_CONTENT_HEIGHT = 720;

type Snapshot = { url: string; height: number };

/** Capture cache, keyed by design + theme so restyling re-renders. */
const thumbnailCache = new Map<string, Snapshot>();

const COPY_MARK = "data-design-thumb-style";

/** Mirrors the parent page's styles and fonts into the iframe document. */
function syncFrameStyles(doc: Document) {
  doc.head.querySelectorAll(`[${COPY_MARK}]`).forEach((el) => el.remove());
  document
    .querySelectorAll("head style, head link[rel='stylesheet']")
    .forEach((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.setAttribute(COPY_MARK, "");
      doc.head.appendChild(clone);
    });
  // Neutralize the page root's min-h-screen inside the thumbnail (so
  // measuring gives the section's true height) and freeze SectionShell
  // entrance animations, which would otherwise be captured mid-fade.
  const reset = doc.createElement("style");
  reset.setAttribute(COPY_MARK, "");
  reset.textContent = `
    .design-thumb-content [class~="min-h-screen"] { min-height: 0 !important; }
    .design-thumb-content .shell-anim { transition: none !important; }
    .design-thumb-content .shell-anim-hidden { opacity: 1 !important; transform: none !important; }
  `;
  doc.head.appendChild(reset);
  // next/font variable classes, as on the real page's root elements.
  fontVariables.split(" ").forEach((cls) => doc.body.classList.add(cls));
  doc.body.style.margin = "0";
  doc.body.style.background = "#ffffff";
}

/**
 * Resolves once the iframe's copied stylesheets have loaded AND its
 * fonts are ready. (fonts.ready alone resolves immediately while the
 * stylesheet <link>s are still in flight — before any @font-face is
 * even registered — which is how captures ended up with fallback
 * fonts.)
 */
async function whenFrameSettled(doc: Document): Promise<void> {
  const links = [
    ...doc.querySelectorAll<HTMLLinkElement>(`link[rel="stylesheet"][${COPY_MARK}]`),
  ];
  await Promise.all(
    links.map((link) =>
      link.sheet
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  // One frame so layout runs with the new styles and font loads start.
  await new Promise((resolve) => {
    const win = doc.defaultView;
    if (win) win.requestAnimationFrame(() => resolve(null));
    else resolve(null);
  });
  try {
    await doc.fonts?.ready;
  } catch {
    /* render with fallback fonts */
  }
}

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

  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    design.thumbnail
      ? { url: design.thumbnail, height: MAX_CONTENT_HEIGHT }
      : (thumbnailCache.get(cacheKey) ?? null),
  );
  const [cardWidth, setCardWidth] = useState(0);
  /** Content height at the 1280px viewport, measured after fonts load. */
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  // Render-time adjustment (not an effect): re-resolve the cached image
  // when the design or theme changes.
  const [lastKey, setLastKey] = useState(cacheKey);
  if (lastKey !== cacheKey) {
    setLastKey(cacheKey);
    setSnapshot(
      design.thumbnail
        ? { url: design.thumbnail, height: MAX_CONTENT_HEIGHT }
        : (thumbnailCache.get(cacheKey) ?? null),
    );
    setContentHeight(null);
  }

  // Recompute the scale whenever the card resizes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) setCardWidth(el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Prepare the sandboxed iframe document for the portal. A src-less
  // frame is same-origin, so the preview renders into it while
  // "sandbox" (without allow-scripts) keeps its content inert.
  const setFrame = useCallback((frame: HTMLIFrameElement | null) => {
    const doc = frame?.contentDocument;
    setMountNode(doc?.body ?? null);
  }, []);

  // Styles and fonts: copy once, then keep in sync (dev HMR and lazy
  // chunks add styles to the parent head after mount).
  useEffect(() => {
    if (!mountNode) return;
    const doc = mountNode.ownerDocument;
    syncFrameStyles(doc);
    const observer = new MutationObserver(() => syncFrameStyles(doc));
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [mountNode]);

  // Site theme variables (colors, fonts, radii, shadows) on the iframe
  // root, exactly like the page root applies them.
  useEffect(() => {
    if (!mountNode) return;
    const root = mountNode.ownerDocument.documentElement;
    const vars = buildThemeStyle(theme) as Record<string, string>;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, String(value));
    }
  }, [mountNode, theme]);

  // Measure the content height once the iframe's stylesheets and fonts
  // are ready, and re-measure if the content reflows (images loading).
  useEffect(() => {
    if (snapshot || !mountNode) return;
    const doc = mountNode.ownerDocument;
    let cancelled = false;
    const measure = () => {
      const height = liveRef.current?.offsetHeight;
      if (!cancelled && height) setContentHeight(height);
    };
    void whenFrameSettled(doc).then(measure);
    const node = liveRef.current;
    const observer = node ? new ResizeObserver(measure) : null;
    if (node && observer) observer.observe(node);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [snapshot, mountNode]);

  // One-off capture after stylesheets, fonts and layout settle.
  useEffect(() => {
    if (snapshot || !mountNode) return;
    const doc = mountNode.ownerDocument;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      await whenFrameSettled(doc);
      const node = liveRef.current;
      if (!node || cancelled) return;
      const height = Math.min(node.offsetHeight || MAX_CONTENT_HEIGHT, MAX_CONTENT_HEIGHT);
      toPng(node, {
        width: RENDER_WIDTH,
        height,
        canvasWidth: 512,
        canvasHeight: Math.max(1, Math.round((512 * height) / RENDER_WIDTH)),
        pixelRatio: 1,
      })
        .then((url) => {
          if (cancelled) return;
          const entry = { url, height };
          thumbnailCache.set(cacheKey, entry);
          setSnapshot(entry);
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
  }, [cacheKey, snapshot, mountNode]);

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

  // Fixed 1280px viewport scaled to the card; crop tall content from
  // the top of the card downward (the iframe shows cardHeight / scale
  // content pixels). The card height tracks the content so short
  // sections leave no empty space.
  const scale = cardWidth > 0 ? cardWidth / RENDER_WIDTH : 0.2;
  const knownHeight = snapshot?.height ?? contentHeight ?? MAX_CONTENT_HEIGHT;
  const visibleContentHeight = Math.min(knownHeight, MAX_CONTENT_HEIGHT);
  const cardHeight = visibleContentHeight * scale;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-white"
      style={{ height: cardWidth > 0 ? cardHeight : undefined }}
    >
      {snapshot ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={snapshot.url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full select-none object-cover object-top"
          loading="lazy"
        />
      ) : (
        <>
          <iframe
            ref={setFrame}
            title={`Preview of ${design.name}`}
            sandbox="allow-same-origin"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 select-none border-0"
            style={{
              width: RENDER_WIDTH,
              height: visibleContentHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
          {mountNode
            ? createPortal(
                <div
                  ref={liveRef}
                  className="design-thumb-content"
                  style={{ width: RENDER_WIDTH }}
                >
                  <Render
                    config={puckConfig}
                    // Cast: a single-block preview fragment, not a full page.
                    data={data as never}
                    metadata={{ theme }}
                    // Same as the public renderer: RichTextContent sanitizes.
                    fieldTransforms={{ richtext: ({ value }) => value }}
                  />
                </div>,
                mountNode,
              )
            : null}
        </>
      )}
    </div>
  );
}
