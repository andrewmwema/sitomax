"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createUsePuck } from "@puckeditor/core";
import { useSectionLibrary } from "@/components/editor/section-library";

const usePuckStore = createUsePuck();

/** How long the pill stays visible after the pointer leaves its zone. */
const HIDE_DELAY_MS = 150;
/** Full height of the boundary hover zone, centered on the boundary. */
const ZONE_HEIGHT = 32;

type Boundary = { insertIndex: number; y: number };

/**
 * "+ Add section" buttons between sections.
 *
 * Puck only mounts componentOverlay while a section is hovered or
 * selected, so overlay-based buttons unmount exactly when the pointer
 * reaches them (the flicker). Instead, this layer is ALWAYS mounted:
 * it portals a full-width, 32px-tall hover zone into the canvas iframe
 * for every section boundary (top of the first section and bottom of
 * each section), positioned from measured section rects and kept in
 * sync with a ResizeObserver + MutationObserver.
 *
 * Visibility is per-zone local state driven by pointer hit-testing —
 * hovering never touches Puck or editor state, so the canvas never
 * re-renders while showing or hiding a pill.
 */
export function CanvasInsertZones() {
  const [frameBody, setFrameBody] = useState<HTMLElement | null>(null);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  // Re-measure when sections are added/removed/reordered.
  const contentLength = usePuckStore((s) => s.appState.data.content.length);

  // Find the canvas iframe body (Puck mounts it asynchronously).
  useEffect(() => {
    const timer = window.setInterval(() => {
      const frame = document.querySelector<HTMLIFrameElement>("iframe#preview-frame");
      const body = frame?.contentDocument?.body;
      if (body) {
        setFrameBody(body);
        window.clearInterval(timer);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  // Measure top-level section boundaries in document coordinates.
  useEffect(() => {
    if (!frameBody) return;
    const doc = frameBody.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;

    const sections = () =>
      [...doc.querySelectorAll<HTMLElement>("[data-puck-component]")].filter(
        // Top-level sections only, not items nested inside slots.
        (el) => !el.parentElement?.closest("[data-puck-component]"),
      );

    const observer = new ResizeObserver(() => measure());
    const measure = () => {
      const list: Boundary[] = [];
      sections().forEach((el, i) => {
        observer.observe(el); // Re-observing the same element is a no-op.
        const rect = el.getBoundingClientRect();
        const top = rect.top + win.scrollY;
        if (i === 0) list.push({ insertIndex: 0, y: top });
        list.push({ insertIndex: i + 1, y: top + rect.height });
      });
      setBoundaries((prev) =>
        prev.length === list.length &&
        prev.every((b, i) => b.y === list[i].y && b.insertIndex === list[i].insertIndex)
          ? prev
          : list,
      );
    };

    measure();
    observer.observe(doc.documentElement);
    win.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      win.removeEventListener("resize", measure);
    };
  }, [frameBody, contentLength]);

  if (!frameBody || boundaries.length === 0) return null;

  return createPortal(
    // The layer itself never intercepts the canvas.
    <div
      aria-hidden={undefined}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        pointerEvents: "none",
        // Above Puck's selection outline and block action toolbar.
        zIndex: 80,
      }}
    >
      {boundaries.map((boundary) => (
        <InsertZone
          key={boundary.insertIndex}
          y={boundary.y}
          insertIndex={boundary.insertIndex}
        />
      ))}
    </div>,
    frameBody,
  );
}

/**
 * A 32px-tall, full-width hover zone centered on a section boundary.
 * The zone has pointer-events: none so it never steals clicks or hovers
 * from the sections; the pointer is hit-tested against its rect on
 * pointermove instead. The pill shows while the pointer is inside the
 * zone (which contains the button) or while the button has keyboard
 * focus, and hides HIDE_DELAY_MS after the pointer leaves.
 */
function InsertZone({ y, insertIndex }: { y: number; insertIndex: number }) {
  const { openLibrary, library } = useSectionLibrary();
  const zoneRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local to this zone only: toggling it re-renders just this pill.
  const [show, setShow] = useState(false);

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const doc = zone.ownerDocument;

    const cancelHide = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
    const scheduleHide = () => {
      if (!hideTimer.current) {
        hideTimer.current = setTimeout(() => {
          hideTimer.current = null;
          setShow(false);
        }, HIDE_DELAY_MS);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = zone.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        cancelHide();
        setShow(true); // Same-value updates bail out: no re-renders.
      } else {
        scheduleHide();
      }
    };
    const onPointerLeave = () => scheduleHide();

    doc.addEventListener("pointermove", onPointerMove, { passive: true });
    doc.documentElement.addEventListener("pointerleave", onPointerLeave);
    return () => {
      doc.removeEventListener("pointermove", onPointerMove);
      doc.documentElement.removeEventListener("pointerleave", onPointerLeave);
      cancelHide();
    };
  }, []);

  return (
    <div
      ref={zoneRef}
      data-insert-zone={insertIndex}
      className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
      style={{ top: y - ZONE_HEIGHT / 2, height: ZONE_HEIGHT }}
    >
      <div
        className={`transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 ${
          show || (library.open && library.index === insertIndex) ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <AddSectionPill onClick={() => openLibrary(insertIndex)} small />
      </div>
    </div>
  );
}

/** Persistent "Add section" bar below the canvas (end of the page). */
export function AddSectionEndBar() {
  const { openLibrary } = useSectionLibrary();
  const count = usePuckStore((s) => s.appState.data.content.length);

  return (
    <div data-section-end-bar className="flex justify-center py-5">
      <AddSectionPill onClick={() => openLibrary(count)}>
        {count === 0 ? "Add your first section" : "Add section"}
      </AddSectionPill>
    </div>
  );
}

function AddSectionPill({
  onClick,
  small = false,
  children,
}: {
  onClick: () => void;
  small?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Keep Puck's canvas drag sensor from hijacking the click.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      aria-label="Add section here"
      className={`platform-ui editor-add-section inline-flex items-center gap-1.5 rounded-full bg-[#121212] font-medium text-white shadow-lg transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4B3FE0] ${
        small ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
      }`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        +
      </span>
      {children ?? <span>Add section</span>}
    </button>
  );
}
