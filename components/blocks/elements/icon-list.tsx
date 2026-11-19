import type { ComponentConfig } from "@puckeditor/core";
import { designField, iconField } from "@/lib/puck/fields";
import { colorField, spacingField, typeSizeField } from "@/lib/puck/layout-fields";
import {
  colorCss,
  snapSpacing,
  typeSizeStyle,
  type ColorChoice,
  type SpacingStep,
  type TypeSize,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { BlockIcon } from "../ui/icon";
import type { IconValue } from "@/lib/icons";

export type IconListElementProps = {
  design?: BlockDesign;
  items: { icon: IconValue; text: string }[];
  iconColor: ColorChoice;
  size: TypeSize | "auto";
  gap: SpacingStep;
};

export const IconListElement: ComponentConfig<IconListElementProps> = {
  label: "Icon list",
  inline: true,
  fields: {
    items: {
      type: "array",
      label: "Items",
      getItemSummary: (item) => item.text || "Item",
      defaultItemProps: { icon: "check", text: "New item" },
      arrayFields: {
        icon: iconField("Icon"),
        text: { type: "text", label: "Text", contentEditable: true },
      },
    },
    iconColor: colorField("Icon color", { allowAuto: false }),
    size: typeSizeField("Text size"),
    gap: spacingField("Space between items"),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    items: [
      { icon: "check", text: "Licensed and insured" },
      { icon: "check", text: "Upfront, honest pricing" },
      { icon: "check", text: "Satisfaction guaranteed" },
    ],
    iconColor: "primary",
    size: "base",
    gap: 12,
  },
  render: ({ items, iconColor, size, gap, puck }) => {
    const text = typeSizeStyle(size, "base");
    return (
      <ul
        className="m-0 flex list-none flex-col p-0"
        style={{ gap: snapSpacing(gap, 12), ...text }}
      >
        {(items ?? []).map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="inline-flex shrink-0 items-center"
              style={{ color: colorCss(iconColor, "primary"), height: `${text.lineHeight}em` }}
            >
              <BlockIcon name={item.icon} size={18} editPath={puck.isEditing ? `items.${i}.icon` : undefined} />
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    );
  },
};
