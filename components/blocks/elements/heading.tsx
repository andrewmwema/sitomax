import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import {
  alignField,
  colorField,
  fontField,
  fontWeightField,
  typeSizeField,
} from "@/lib/puck/layout-fields";
import {
  oneOf,
  type Align,
  type ColorChoice,
  type FontChoice,
  type FontWeightChoice,
  type TypeSize,
  type TypeToken,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { FontLink, fontWeightCss, textStyle } from "./shared";

type HeadingLevel = "h1" | "h2" | "h3" | "h4";

export type HeadingElementProps = {
  design?: BlockDesign;
  text: string;
  level: HeadingLevel;
  size: TypeSize | "auto";
  font: FontChoice;
  weight: FontWeightChoice;
  color: ColorChoice;
  align: Align;
};

const LEVEL_SIZES: Record<HeadingLevel, TypeToken> = {
  h1: "5xl",
  h2: "4xl",
  h3: "2xl",
  h4: "xl",
};

export const HeadingElement: ComponentConfig<HeadingElementProps> = {
  label: "Heading",
  inline: true,
  fields: {
    text: { type: "text", label: "Text", contentEditable: true },
    level: {
      type: "select",
      label: "Heading level (for SEO)",
      options: [
        { label: "H1 – page title", value: "h1" },
        { label: "H2 – section title", value: "h2" },
        { label: "H3", value: "h3" },
        { label: "H4", value: "h4" },
      ],
    },
    size: typeSizeField("Size", "Match heading level"),
    font: fontField(),
    weight: fontWeightField(),
    color: colorField("Color"),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    text: "Your heading here",
    level: "h2",
    size: "auto",
    font: "heading",
    weight: "theme",
    color: "auto",
    align: "left",
  },
  render: ({ text, level, size, font, weight, color, align }) => {
    const Tag = oneOf(level, ["h1", "h2", "h3", "h4"], "h2");
    return (
      <>
        <FontLink choice={font} />
        <Tag
          className="m-0 text-balance"
          style={{
            ...textStyle({
              size,
              sizeFallback: LEVEL_SIZES[Tag],
              font,
              fontFallback: "heading",
              color,
              colorFallback: "text",
              align,
            }),
            fontWeight: fontWeightCss(weight, "theme"),
          }}
        >
          {text}
        </Tag>
      </>
    );
  },
};
