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
import { readIcon, type IconValue } from "@/lib/icons";

type IconSize = "24" | "32" | "48" | "64";
type IconStyle = "plain" | "soft" | "solid";

export type IconElementProps = {
  design?: BlockDesign;
  icon: IconValue;
  size: IconSize;
  style: IconStyle;
  color: ColorChoice;
  align: Align;
};

export const IconElement: ComponentConfig<IconElementProps> = {
  label: "Icon",
  inline: true,
  fields: {
    icon: iconField("Icon"),
    size: {
      type: "radio",
      label: "Size",
      options: [
        { label: "S", value: "24" },
        { label: "M", value: "32" },
        { label: "L", value: "48" },
        { label: "XL", value: "64" },
      ],
    },
    style: {
      type: "radio",
      label: "Style",
      options: [
        { label: "Plain", value: "plain" },
        { label: "Soft tile", value: "soft" },
        { label: "Solid tile", value: "solid" },
      ],
    },
    color: colorField("Color", { allowAuto: false }),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    icon: "star",
    size: "32",
    style: "soft",
    color: "primary",
    align: "left",
  },
  render: ({ icon, size, style, color, align, puck }) => {
    const appearance = readIcon(icon);
    const px = appearance.size ?? Number(oneOf(size, ["24", "32", "48", "64"], "32"));
    const variant = oneOf(style, ["plain", "soft", "solid"], "soft");
    const tint = colorCss(appearance.color ?? color, "primary") ?? "var(--color-primary)";
    const tile =
      variant === "plain"
        ? { color: tint }
        : {
            width: Math.round(px * 1.9),
            height: Math.round(px * 1.9),
            borderRadius: "var(--radius-lg)",
            backgroundColor:
              variant === "solid" ? tint : `color-mix(in srgb, ${tint} 12%, transparent)`,
            color: variant === "solid" ? "var(--color-on-primary)" : tint,
          };
    return (
      <div className="flex" style={{ justifyContent: JUSTIFY[safeAlign(align)] }}>
        <span className="inline-flex shrink-0 items-center justify-center" style={tile}>
          <BlockIcon name={appearance.name} size={px} editPath={puck.isEditing ? "icon" : undefined} />
        </span>
      </div>
    );
  },
};
