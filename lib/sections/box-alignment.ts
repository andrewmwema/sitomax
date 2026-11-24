/**
 * Centered text whose box is not centered: the box is narrower than the
 * container it sits in and is pushed to one side, so its lines are centered
 * around the wrong point. Text alignment alone cannot show this.
 *
 * Measures rendered boxes, so call it only in a browser.
 */
export type OffCenterText = {
  /** The first words of the text, to help find it. */
  text: string;
  /** Free space on each side of the box inside its container, in px. */
  left: number;
  right: number;
};

const TEXT_BLOCKS = "h1, h2, h3, h4, h5, h6, p, blockquote";
/**
 * The boxes that belong to a piece of text: its rich-text wrappers and, in a
 * custom layout, its element. Anything further out is page layout, which is
 * narrower than its container by design (a page container, an offset column).
 */
const TEXT_WRAPPERS = ".rich-text, .rich-heading, .layout-shell-element";
const SKIPPED = "script, style, svg, [hidden], [aria-hidden='true'], .sr-only, [data-puck-overlay-portal]";
/** Boxes that are placed by their layout or are objects of their own, not a column of text. */
const OBJECTS = "a, button, label, figure, nav";
/** Smaller differences are rounding and optical adjustments, not a misplaced box. */
const TOLERANCE = 8;

function px(value: string) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

/** A background, border or shadow makes a box a card or badge: where it sits is a design choice. */
function isDecorated(style: CSSStyleDeclaration) {
  const background = style.backgroundColor;
  const painted = background !== "" && background !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(background);
  const bordered = ["top", "right", "bottom", "left"].some((side) =>
    px(style.getPropertyValue(`border-${side}-width`)) > 0 && style.getPropertyValue(`border-${side}-style`) !== "none");
  const set = (value: string) => value !== "" && value !== "none";
  return painted || bordered || set(style.boxShadow) || set(style.backgroundImage);
}

/** Whether a container stacks its children in one column, so a narrower child has a side to drift to. */
function stacks(style: CSSStyleDeclaration) {
  if (/flex$/.test(style.display)) return style.flexDirection.startsWith("column");
  return ["block", "flow-root", "list-item", "inline-block", "table-cell"].includes(style.display);
}

function inColumns(element: Element, section: Element, view: Window) {
  for (let node = element.parentElement; node && section.contains(node); node = node.parentElement) {
    const { columnCount, columnWidth } = view.getComputedStyle(node);
    if ((columnCount !== "" && columnCount !== "auto") || (columnWidth !== "" && columnWidth !== "auto")) return true;
  }
  return false;
}

export function findOffCenterText(section: Element): OffCenterText[] {
  const view = section.ownerDocument.defaultView;
  if (!view) return [];
  const found: OffCenterText[] = [];
  const reported = new Set<Element>();
  for (const element of section.querySelectorAll(TEXT_BLOCKS)) {
    const words = element.textContent?.replace(/\s+/g, " ").trim();
    if (!words || element.closest(SKIPPED)) continue;
    const own = view.getComputedStyle(element);
    if (own.textAlign !== "center" || own.visibility === "hidden" || isDecorated(own)) continue;
    // Text flowing through newspaper columns is narrower than its container by design.
    if (inColumns(element, section, view)) continue;
    let outermost: Element = element;
    for (let node = element.parentElement; node && node !== section; node = node.parentElement) {
      if (node.matches(TEXT_WRAPPERS)) outermost = node;
    }
    let box: Element = element;
    while (box !== section) {
      const style = view.getComputedStyle(box);
      if (style.textAlign !== "center" || style.position === "absolute" || style.position === "fixed" || /^(left|right)$/.test(style.float)) break;
      if (box !== element && (isDecorated(style) || box.matches(OBJECTS))) break;
      // A parent without a box of its own lays nothing out: the next one up does.
      let parent = box.parentElement;
      while (parent && parent !== section && view.getComputedStyle(parent).display === "contents") parent = parent.parentElement;
      if (!parent || !section.contains(parent)) break;
      const container = view.getComputedStyle(parent);
      if (!stacks(container)) break;
      const bounds = box.getBoundingClientRect();
      const outer = parent.getBoundingClientRect();
      if (bounds.width <= 0 || outer.width <= 0) break;
      const left = bounds.left - (outer.left + px(container.borderLeftWidth) + px(container.paddingLeft));
      const right = outer.right - px(container.borderRightWidth) - px(container.paddingRight) - bounds.right;
      if (left + right > TOLERANCE && Math.abs(left - right) > TOLERANCE) {
        if (!reported.has(box)) {
          reported.add(box);
          found.push({ text: words.slice(0, 60), left: Math.round(left), right: Math.round(right) });
        }
        break;
      }
      if (box === outermost) break;
      box = parent;
    }
  }
  return found;
}
