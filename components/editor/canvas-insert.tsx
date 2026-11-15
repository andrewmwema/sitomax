"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createUsePuck, registerOverlayPortal } from "@puckeditor/core";
import { useSectionLibrary } from "@/components/editor/section-library";

const usePuckStore = createUsePuck();

/**
 * "+ Add section" buttons shown on the canvas. One straddles the top
 * edge of the first section and one the bottom edge of every section
 * (i.e. between any two sections and after the last one); they appear
 * on hover/selection via Puck's componentOverlay override.
 */
export function OverlayInsertButtons({
  componentId,
  visible,
}: {
  componentId: string;
  visible: boolean;
}) {
  const index = usePuckStore((s) =>
    s.appState.data.content.findIndex((item) => item.props.id === componentId),
  );

  // Only top-level sections get insert buttons (not items inside slots).
  if (!visible || index < 0) return null;

  return (
    <>
      {index === 0 ? <InsertButton position="top" insertIndex={0} /> : null}
      <InsertButton position="bottom" insertIndex={index + 1} />
    </>
  );
}

function InsertButton({
  position,
  insertIndex,
}: {
  position: "top" | "bottom";
  insertIndex: number;
}) {
  const { openLibrary } = useSectionLibrary();
  const portalRef = useRef<HTMLDivElement>(null);

  // Overlay elements are inert by default; the portal makes it clickable.
  useEffect(() => registerOverlayPortal(portalRef.current), []);

  return (
    <div
      ref={portalRef}
      className={`absolute left-1/2 z-50 -translate-x-1/2 ${
        position === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
      }`}
    >
      <AddSectionPill onClick={() => openLibrary(insertIndex)} small />
    </div>
  );
}

/** Persistent "Add section" bar below the canvas (end of the page). */
export function AddSectionEndBar() {
  const { openLibrary } = useSectionLibrary();
  const count = usePuckStore((s) => s.appState.data.content.length);

  return (
    <div className="flex justify-center py-5">
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
      className={`inline-flex items-center gap-1.5 rounded-full bg-zinc-900 font-medium text-white shadow-lg transition hover:bg-zinc-700 ${
        small ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
      }`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        +
      </span>
      {children ?? "Add section"}
    </button>
  );
}
