/**
 * Shared structure of the custom layout system:
 * Section → Row → Column → Element (Puck slot fields).
 */

export const ROW_LAYOUTS = {
  "1": { label: "1/1", fractions: [1] },
  "1-1": { label: "1/2 + 1/2", fractions: [1, 1] },
  "1-2": { label: "1/3 + 2/3", fractions: [1, 2] },
  "2-1": { label: "2/3 + 1/3", fractions: [2, 1] },
  "1-1-1": { label: "1/3 × 3", fractions: [1, 1, 1] },
  "1-1-1-1": { label: "1/4 × 4", fractions: [1, 1, 1, 1] },
} as const satisfies Record<string, { label: string; fractions: readonly number[] }>;

export type RowLayout = keyof typeof ROW_LAYOUTS;
export const ROW_LAYOUT_IDS = Object.keys(ROW_LAYOUTS) as RowLayout[];

export function safeRowLayout(value: unknown): RowLayout {
  return typeof value === "string" && Object.hasOwn(ROW_LAYOUTS, value)
    ? (value as RowLayout)
    : "1";
}

/** CSS grid template for a preset (minmax(0,…) so content never overflows). */
export function rowTemplate(layout: RowLayout): string {
  return ROW_LAYOUTS[layout].fractions.map((f) => `minmax(0, ${f}fr)`).join(" ");
}

export const LAYOUT_TYPES = ["Section", "Row", "Column"] as const;

export const ELEMENT_TYPES = [
  "Heading",
  "Text",
  "Button",
  "Image",
  "Icon",
  "IconList",
  "Video",
  "Divider",
  "VerticalSpace",
  "SocialIcons",
  "MapEmbed",
  "Form",
  "Countdown",
  "Badge",
  "StatNumber",
  "Embed",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export function isLayoutOrElementType(type: unknown): boolean {
  return (
    (LAYOUT_TYPES as readonly unknown[]).includes(type) ||
    (ELEMENT_TYPES as readonly unknown[]).includes(type)
  );
}

/** Puck-style component id ("Type-uuid"). */
export function newComponentId(type: string): string {
  return `${type}-${globalThis.crypto.randomUUID()}`;
}

/** A Puck content item; slot props hold arrays of these. */
export type LayoutItem = {
  type: string;
  props: { id: string; [key: string]: unknown };
};

export function emptyColumn(): LayoutItem {
  return {
    type: "Column",
    props: { id: newComponentId("Column"), design: {}, verticalAlign: "top", gap: 16, content: [] },
  };
}

/**
 * Keeps a row's columns in sync with its preset: missing columns are
 * added empty; surplus columns are removed, with their elements moved
 * into the last remaining column so nothing a client built is lost.
 */
export function fitColumns(columns: unknown, layout: RowLayout): LayoutItem[] {
  const count = ROW_LAYOUTS[layout].fractions.length;
  const current = (Array.isArray(columns) ? columns : []).filter(
    (item): item is LayoutItem =>
      Boolean(item) && typeof item === "object" && (item as LayoutItem).type === "Column",
  );
  if (current.length === count) {
    // Same array back when already in sync, so callers can detect no-ops.
    return Array.isArray(columns) && columns.length === count ? (columns as LayoutItem[]) : current;
  }
  if (current.length < count) {
    return [...current, ...Array.from({ length: count - current.length }, emptyColumn)];
  }
  const kept = current.slice(0, count);
  const overflow = current
    .slice(count)
    .flatMap((column) => (Array.isArray(column.props.content) ? column.props.content : []));
  const last = kept[count - 1];
  kept[count - 1] = {
    ...last,
    props: {
      ...last.props,
      content: [...(Array.isArray(last.props.content) ? last.props.content : []), ...overflow],
    },
  };
  return kept;
}

/** "Blank section": an empty Section with one Row of the given preset. */
export function blankSection(layout: RowLayout = "1"): LayoutItem {
  return {
    type: "Section",
    props: {
      id: newComponentId("Section"),
      design: {},
      background: "default",
      width: "contained",
      rowGap: 48,
      rows: [
        {
          type: "Row",
          props: {
            id: newComponentId("Row"),
            design: {},
            layout,
            gap: 32,
            reverseOnMobile: false,
            columns: fitColumns([], layout),
          },
        },
      ],
    },
  };
}
