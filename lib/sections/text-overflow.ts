/** Measures rendered text, not estimated text length. Call only in a browser. */
export function hasTextOverflow(section: Element): boolean {
  const doc = section.ownerDocument;
  const view = doc.defaultView;
  if (!view) return false;
  const walker = doc.createTreeWalker(section, 4);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, svg, [hidden], [aria-hidden='true'], .sr-only, [data-puck-overlay-portal]")) continue;
    const style = view.getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) continue;
    for (let ancestor: Element | null = parent; ancestor && section.contains(ancestor); ancestor = ancestor.parentElement) {
      const current = view.getComputedStyle(ancestor);
      if (/(auto|scroll)/.test(current.overflowX) || /(auto|scroll)/.test(current.overflowY)) break;
      if (current.display === "inline" || current.display === "contents") continue;
      const bounds = ancestor.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      const clipsVertically = /^(hidden|clip)$/.test(current.overflowY);
      if (rects.some((rect) => rect.left < bounds.left - 2 || rect.right > bounds.right + 2 ||
        (clipsVertically && (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2)))) {
        return true;
      }
    }
  }
  return false;
}
