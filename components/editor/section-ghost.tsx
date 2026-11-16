"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createUsePuck } from "@puckeditor/core";
import { DesignThumbnail } from "./design-thumbnail";
import { ROOT_ZONE, useSectionLibrary } from "./section-library";

const usePuckStore = createUsePuck();

/** Canvas-only DOM: never dispatched to Puck, autosave, publish or undo history. */
export function SectionGhost() {
  const { preview, library, theme } = useSectionLibrary();
  const content = usePuckStore((state) => state.appState.data.content);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!preview || !library.open) return;
    const doc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
    if (!doc) return;
    const sections = [...doc.querySelectorAll<HTMLElement>("[data-puck-component]")]
      .filter((element) => !element.parentElement?.closest("[data-puck-component]"));
    const index = Math.min(library.index, sections.length);
    const next = sections[index];
    const last = sections.at(-1);
    const parent = next?.parentElement ?? last?.parentElement ??
      doc.querySelector(`[data-puck-dropzone="${ROOT_ZONE}"]`);
    if (!parent) return;
    const node = doc.createElement("div");
    node.dataset.sectionGhost = "";
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = "pointer-events:none;opacity:.55;outline:2px dashed #2563eb;outline-offset:-2px;min-width:0;";
    parent.insertBefore(node, next ?? (last ? last.nextSibling : parent.firstChild));
    const frame = requestAnimationFrame(() => {
      setMount(node);
      node.scrollIntoView({ block: "nearest" });
    });
    return () => { cancelAnimationFrame(frame); node.remove(); };
  }, [preview, library.open, library.index, content]);

  return mount && preview
    ? createPortal(<DesignThumbnail design={preview} theme={theme} expanded />, mount)
    : null;
}
