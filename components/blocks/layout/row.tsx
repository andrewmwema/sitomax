import type { CSSProperties } from "react";
import type { ComponentConfig, Slot } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { rowLayoutField, spacingField } from "@/lib/puck/layout-fields";
import { snapSpacing, type SpacingStep } from "@/lib/layout/guardrails";
import {
  ROW_LAYOUTS,
  fitColumns,
  rowTemplate,
  safeRowLayout,
  type RowLayout,
} from "@/lib/layout/structure";
import type { BlockDesign } from "@/lib/sections/design";

export type RowProps = {
  design?: BlockDesign;
  layout: RowLayout;
  gap: SpacingStep;
  reverseOnMobile: boolean;
  columns: Slot;
};

/**
 * Custom layout: 1–4 columns from a ratio preset. Columns stack on
 * mobile (optionally in reverse order) and 4-column rows go 2×2 on
 * tablets. The preset owns the column count (see fitColumns).
 */
export const Row: ComponentConfig<RowProps> = {
  label: "Row",
  inline: true,
  fields: {
    layout: rowLayoutField("Columns"),
    gap: spacingField("Space between columns"),
    reverseOnMobile: {
      type: "radio",
      label: "On mobile",
      options: [
        { label: "Stack", value: false },
        { label: "Stack reversed", value: true },
      ],
    },
    design: designField("row"),
    columns: { type: "slot", allow: ["Column"] },
  },
  defaultProps: {
    design: {},
    layout: "1",
    gap: 32,
    reverseOnMobile: false,
    columns: [],
  },
  resolveData: (data) => {
    const columns = fitColumns(data.props.columns, safeRowLayout(data.props.layout));
    if (columns === data.props.columns) return data;
    return { ...data, props: { ...data.props, columns: columns as Slot } };
  },
  render: ({ layout, gap, reverseOnMobile, columns: Columns }) => {
    const preset = safeRowLayout(layout);
    const count = ROW_LAYOUTS[preset].fractions.length;
    return (
      <Columns
        className={`layout-row layout-row-${count}${reverseOnMobile === true ? " layout-row-reverse" : ""}`}
        style={
          {
            "--row-cols": rowTemplate(preset),
            "--row-gap": `${snapSpacing(gap, 32)}px`,
          } as CSSProperties
        }
      />
    );
  },
};
