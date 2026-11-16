import type { CSSProperties } from "react";
import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, richTextField } from "@/lib/puck/fields";
import { alignField, colorField, fontField, typeSizeField } from "@/lib/puck/layout-fields";
import {
  colorCss,
  type Align,
  type ColorChoice,
  type FontChoice,
  type TypeSize,
} from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { RichTextContent } from "../ui/rich-text";
import { FontLink, textStyle } from "./shared";

export type TextElementProps = {
  design?: BlockDesign;
  text: RichText;
  size: TypeSize | "auto";
  font: FontChoice;
  color: ColorChoice;
  align: Align;
};

export const TextElement: ComponentConfig<TextElementProps> = {
  label: "Text",
  inline: true,
  fields: {
    text: richTextField("Text"),
    size: typeSizeField("Size"),
    font: fontField(),
    color: colorField("Color"),
    align: alignField(),
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    text: "<p>Write a few sentences about your business. Click here to edit this text.</p>",
    size: "base",
    font: "body",
    color: "auto",
    align: "left",
  },
  render: ({ text, size, font, color, align }) => (
    <>
      <FontLink choice={font} />
      <RichTextContent
        value={text}
        className="layout-text"
        style={
          {
            ...textStyle({ size, sizeFallback: "base", font, fontFallback: "body", align }),
            "--layout-text-color": colorCss(color),
          } as CSSProperties
        }
      />
    </>
  ),
};
