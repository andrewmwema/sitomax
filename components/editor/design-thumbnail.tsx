"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Render } from "@puckeditor/core";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { buildThemeStyle, type SiteTheme } from "@/lib/theme/presets";
import type { SectionDesign } from "@/lib/sections/catalog";
import type { BlogFeedPost } from "@/components/blocks/blog-posts";

/**
 * Gallery thumbnail for a section design. The design renders live at a
 * fixed 1280px viewport inside a sandboxed <iframe> (no scripts). Cards
 * use a cover crop based on the rendered section height; expanded
 * previews retain the complete section at the selected viewport width.
 *
 * The iframe document receives everything the real page has: the app's
 * compiled stylesheets (kept in sync with a MutationObserver, since dev
 * HMR injects styles after mount), and the site theme CSS variables on
 * its root. Backgrounds are resolved after its fonts and styles load.
 *
 * Live previews preserve the site's remotely loaded fonts.
 */

const DEFAULT_RENDER_WIDTH = 1280;

const COPY_MARK = "data-design-thumb-style";

const SAMPLE_POSTS: BlogFeedPost[] = [
  { id: "sample-1", slug: "making-room-for-good-ideas", published_at: "2025-01-15T12:00:00Z", featured: true,
    publication: { metadata: { title: "Making room for good ideas", excerpt: "A thoughtful starting point for your next project.", thumbnail_image: "/samples/home-interior.jpg", cover_image: "", reading_minutes: 4, category: null, author: null } } },
  { id: "sample-2", slug: "a-closer-look-at-the-details", published_at: "2025-01-08T12:00:00Z", featured: false,
    publication: { metadata: { title: "A closer look at the details", excerpt: "Small choices that make a lasting difference.", thumbnail_image: "/samples/kitchen.jpg", cover_image: "", reading_minutes: 3, category: null, author: null } } },
  { id: "sample-3", slug: "planning-the-next-step", published_at: "2025-01-01T12:00:00Z", featured: false,
    publication: { metadata: { title: "Planning the next step", excerpt: "Simple questions to help bring a good plan together.", thumbnail_image: "/samples/team-at-work.jpg", cover_image: "", reading_minutes: 5, category: null, author: null } } },
];

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
    html, body { overflow: hidden !important; }
    .design-thumb-content [class~="min-h-screen"] { min-height: 0 !important; }
    .design-thumb-content .shell-anim { transition: none !important; }
    .design-thumb-content .shell-anim-hidden { opacity: 1 !important; transform: none !important; }
  `;
  doc.head.appendChild(reset);
  doc.body.style.margin = "0";
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
    ...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
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
  expanded = false,
  viewportWidth = DEFAULT_RENDER_WIDTH,
}: {
  design: SectionDesign;
  theme: SiteTheme;
  expanded?: boolean;
  /** Actual iframe viewport width; scaling changes only its display size. */
  viewportWidth?: number;
}) {
  const [cardWidth, setCardWidth] = useState(0);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState(viewportWidth * 10 / 16);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Recompute the scale whenever the card resizes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setCardWidth(entry.contentRect.width);
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
    let cancelled = false;
    const sync = () => {
      syncFrameStyles(doc);
      void whenFrameSettled(doc).then(() => {
        if (!cancelled) updateBackground();
      });
    };
    const updateBackground = () => {
      const content = liveRef.current;
      const win = doc.defaultView;
      if (!content || !win) return;
      // A custom shell background sits behind the transparent section.
      const surfaces = [
        content.querySelector("section"),
        content.querySelector('.section-shell > [aria-hidden="true"] > div'),
        content.querySelector(".site-content"),
      ];
      const background = surfaces
        .filter((element): element is Element => element !== null)
        .map((element) => win.getComputedStyle(element).backgroundColor)
        .find((color) => color !== "rgba(0, 0, 0, 0)" && color !== "transparent");
      if (!background) return;
      doc.documentElement.style.backgroundColor = background;
      doc.body.style.backgroundColor = background;
      if (containerRef.current) containerRef.current.style.backgroundColor = background;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true });
    const resizeObserver = new ResizeObserver(() => {
      updateBackground();
      if (liveRef.current) setContentHeight(liveRef.current.scrollHeight);
    });
    if (liveRef.current) resizeObserver.observe(liveRef.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [mountNode, design, theme, viewportWidth]);

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

  const widthScale = cardWidth > 0 ? cardWidth / viewportWidth : 0.2;
  const scale = expanded || contentHeight <= 0
    ? widthScale
    : Math.max(widthScale, cardWidth * 10 / 16 / contentHeight);
  const offsetX = expanded ? 0 : (cardWidth - viewportWidth * scale) / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={expanded ? { height: contentHeight * scale } : { aspectRatio: "16 / 10" }}
    >
      {visible ? (
      <iframe
        ref={setFrame}
        title={`Preview of ${design.name}`}
        sandbox="allow-same-origin"
        scrolling="no"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 select-none border-0"
        style={{
          width: viewportWidth,
          height: contentHeight,
          transform: `translateX(${offsetX}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
      ) : null}
      {mountNode
        ? createPortal(
            <div
              ref={liveRef}
              className="design-thumb-content"
              style={{ width: viewportWidth }}
            >
              <Render
                config={puckConfig}
                // Cast: a single-block preview fragment, not a full page.
                data={data as PuckPageData}
                metadata={{ theme, siteBlogPosts: SAMPLE_POSTS }}
                // Same as the public renderer: RichTextContent sanitizes.
                fieldTransforms={{ richtext: ({ value }) => value }}
              />
            </div>,
            mountNode,
          )
        : null}
    </div>
  );
}
