import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { alignField, colorField } from "@/lib/puck/layout-fields";
import {
  JUSTIFY,
  colorCss,
  oneOf,
  safeAlign,
  type Align,
  type ColorChoice,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { WIDTH_OPTIONS } from "./shared";

export type DividerElementProps = {
  design?: BlockDesign;
  lineStyle: "solid" | "dashed" | "dotted";
  thickness: "1" | "2" | "4";
  width: string;
  color: ColorChoice;
  align: Align;
};

export const DividerElement: ComponentConfig<DividerElementProps> = {
  label: "Divider",
  inline: true,
  fields: {
    lineStyle: {
      type: "radio",
      label: "Line",
      options: [
        { label: "Solid", value: "solid" },
        { label: "Dashed", value: "dashed" },
        { label: "Dotted", value: "dotted" },
      ],
    },
    thickness: {
      type: "radio",
      label: "Thickness",
      options: [
        { label: "Thin", value: "1" },
        { label: "Medium", value: "2" },
        { label: "Thick", value: "4" },
      ],
    },
    width: { type: "select", label: "Width", options: WIDTH_OPTIONS },
    color: colorField("Color", { allowAuto: false }),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    lineStyle: "solid",
    thickness: "1",
    width: "100",
    color: "border",
    align: "center",
  },
  render: ({ lineStyle, thickness, width, color, align }) => (
    <div className="flex" style={{ justifyContent: JUSTIFY[safeAlign(align, "center")] }}>
      <hr
        className="m-0 border-0"
        style={{
          width: `${oneOf(width, ["100", "75", "50", "25"], "100")}%`,
          borderTopWidth: `${oneOf(thickness, ["1", "2", "4"], "1")}px`,
          borderTopStyle: oneOf(lineStyle, ["solid", "dashed", "dotted"], "solid"),
          borderTopColor: colorCss(color, "border"),
        }}
      />
    </div>
  ),
};
