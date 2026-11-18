import type { CSSProperties } from "react";
import type { ComponentConfig, Slot } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { spacingField } from "@/lib/puck/layout-fields";
import { oneOf, snapSpacing, type SpacingStep } from "@/lib/layout/guardrails";
import { ELEMENT_TYPES } from "@/lib/layout/structure";
import type { BlockDesign } from "@/lib/sections/design";

export type VerticalAlign = "top" | "center" | "bottom";
/** Theme-aware card styles (the same surface as designed sections' cards). */
export type ColumnSurface = "none" | "card" | "highlight";

export type ColumnProps = {
  design?: BlockDesign;
  verticalAlign: VerticalAlign;
  surface: ColumnSurface;
  gap: SpacingStep;
  content: Slot;
};

const JUSTIFY: Record<VerticalAlign, CSSProperties["justifyContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

/**
 * Custom layout: one column of a Row, holding elements. Columns are
 * created and removed by their row's preset, so they can't be dragged,
 * duplicated or deleted on their own.
 */
export const Column: ComponentConfig<ColumnProps> = {
  label: "Column",
  inline: true,
  permissions: { drag: false, duplicate: false, delete: false },
  fields: {
    verticalAlign: {
      type: "radio",
      label: "Vertical alignment",
      options: [
        { label: "Top", value: "top" },
        { label: "Center", value: "center" },
        { label: "Bottom", value: "bottom" },
      ],
    },
    surface: {
      type: "radio",
      label: "Card style",
      options: [
        { label: "None", value: "none" },
        { label: "Card", value: "card" },
        { label: "Highlighted", value: "highlight" },
      ],
    },
    gap: spacingField("Space between elements"),
    design: designField("column"),
    content: { type: "slot", allow: [...ELEMENT_TYPES] },
  },
  defaultProps: {
    design: {},
    verticalAlign: "top",
    surface: "none",
    gap: 16,
    content: [],
  },
  render: ({ verticalAlign, surface, gap, content: Content }) => {
    const cardSurface = oneOf(surface, ["none", "card", "highlight"], "none") !== "none";
    return (
      <Content
        className={{
          none: "layout-column",
          card: "layout-column layout-card site-card",
          highlight: "layout-column layout-card layout-card-highlight site-card",
        }[oneOf(surface, ["none", "card", "highlight"], "none")]}
        style={
          {
            justifyContent: JUSTIFY[oneOf(verticalAlign, ["top", "center", "bottom"], "top")],
            "--column-gap": `${snapSpacing(gap, 16)}px`,
            ...(cardSurface
              ? {
                  "--color-text": "var(--color-on-bg, var(--color-text))",
                  "--color-muted": "var(--color-on-bg)",
                  color: "var(--color-on-bg, var(--color-text))",
                }
              : null),
          } as CSSProperties
        }
      />
    );
  },
};
