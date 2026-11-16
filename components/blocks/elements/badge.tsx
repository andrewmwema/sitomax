import type { ComponentConfig } from "@puckeditor/core";
import { designField, iconField } from "@/lib/puck/fields";
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
import { BlockIcon } from "../ui/icon";

export type BadgeElementProps = {
  design?: BlockDesign;
  text: string;
  icon: string;
  showIcon: boolean;
  style: "soft" | "solid" | "outline";
  color: ColorChoice;
  align: Align;
};

export const BadgeElement: ComponentConfig<BadgeElementProps> = {
  label: "Badge",
  inline: true,
  fields: {
    text: { type: "text", label: "Text", contentEditable: true },
    showIcon: {
      type: "radio",
      label: "Icon",
      options: [
        { label: "Show", value: true },
        { label: "Hide", value: false },
      ],
    },
    icon: iconField("Icon"),
    style: {
      type: "radio",
      label: "Style",
      options: [
        { label: "Soft", value: "soft" },
        { label: "Solid", value: "solid" },
        { label: "Outline", value: "outline" },
      ],
    },
    color: colorField("Color", { allowAuto: false }),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    text: "Family owned since 1998",
    icon: "award",
    showIcon: true,
    style: "soft",
    color: "primary",
    align: "left",
  },
  resolveFields: (data, { fields }) => {
    if (data.props.showIcon !== false) return fields;
    return Object.fromEntries(
      Object.entries(fields).filter(([key]) => key !== "icon"),
    ) as typeof fields;
  },
  render: ({ text, icon, showIcon, style, color, align }) => {
    const tint = colorCss(color, "primary") ?? "var(--color-primary)";
    const variant = oneOf(style, ["soft", "solid", "outline"], "soft");
    const look = {
      soft: {
        backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
        color: tint,
        border: "1px solid transparent",
      },
      solid: { backgroundColor: tint, color: "var(--color-on-primary)", border: `1px solid ${tint}` },
      outline: { backgroundColor: "transparent", color: tint, border: `1px solid ${tint}` },
    }[variant];
    return (
      <div className="flex" style={{ justifyContent: JUSTIFY[safeAlign(align)] }}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ ...look, fontFamily: "var(--font-body)" }}
        >
          {showIcon !== false ? <BlockIcon name={icon} size={14} /> : null}
          {text}
        </span>
      </div>
    );
  },
};
