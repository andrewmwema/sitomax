import { findOffCenterText, type OffCenterText } from "@/lib/sections/box-alignment";
import { hasTextOverflow } from "@/lib/sections/text-overflow";

export type LayoutFinding = { overflow: boolean; offCenter: OffCenterText[] };

/** What the browser rendered for one section: text that overflows, and centered text whose box is off-center. */
export function measureLayout(section: Element): LayoutFinding {
  return { overflow: hasTextOverflow(section), offCenter: findOffCenterText(section) };
}

/**
 * The page's sections as the editor canvas renders them, by section id, with
 * the width they are shown at. Null while the canvas is not available.
 */
export function editorCanvas(): { sections: Map<string, HTMLElement>; width: number } | null {
  const frame = document.querySelector<HTMLIFrameElement>("#preview-frame");
  const root = frame ? frame.contentDocument : document.querySelector(".platform-editor");
  if (!root) return null;
  const sections = new Map<string, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-editor-block]")) {
    // Rows, columns and elements carry the attribute too: a section is the outermost one.
    const id = element.dataset.editorBlock;
    if (id && !element.parentElement?.closest("[data-editor-block]")) sections.set(id, element);
  }
  return { sections, width: Math.round(frame?.clientWidth ?? window.innerWidth) };
}
