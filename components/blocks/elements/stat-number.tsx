import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { alignField, colorField, typeSizeField } from "@/lib/puck/layout-fields";
import {
  safeAlign,
  typeSizeStyle,
  colorCss,
  type Align,
  type ColorChoice,
  type TypeSize,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { CountUp } from "../ui/count-up";

export type StatNumberElementProps = {
  design?: BlockDesign;
  value: string;
  label: string;
  size: TypeSize | "auto";
  color: ColorChoice;
  animate: boolean;
  align: Align;
};

export const StatNumberElement: ComponentConfig<StatNumberElementProps> = {
  label: "Stat number",
  inline: true,
  fields: {
    value: { type: "text", label: "Number", placeholder: "1,250+ or 98% or $2M" },
    label: { type: "text", label: "Label", contentEditable: true },
    size: typeSizeField("Number size"),
    color: colorField("Number color", { allowAuto: false }),
    animate: {
      type: "radio",
      label: "Count up on scroll",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    value: "500+",
    label: "Happy customers",
    size: "5xl",
    color: "primary",
    animate: true,
    align: "left",
  },
  render: ({ value, label, size, color, animate, align, puck }) => {
    const text = String(value ?? "").slice(0, 24);
    return (
      <div className="flex flex-col gap-1" style={{ textAlign: safeAlign(align) }}>
        <span
          className="font-bold"
          style={{
            ...typeSizeStyle(size, "5xl"),
            fontFamily: "var(--font-heading)",
            color: colorCss(color, "primary"),
          }}
        >
          {animate !== false && !puck.isEditing ? <CountUp value={text} /> : text}
        </span>
        {label ? (
          <span className="text-base font-medium" style={{ color: "var(--color-muted)" }}>
            {label}
          </span>
        ) : null}
      </div>
    );
  },
};
