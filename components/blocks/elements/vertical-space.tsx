import type { CSSProperties } from "react";
import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { spacingField } from "@/lib/puck/layout-fields";
import { snapSpacing, type SpacingStep } from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";

export type VerticalSpaceElementProps = {
  design?: BlockDesign;
  height: SpacingStep;
  mobileHeight: SpacingStep;
};

export const VerticalSpaceElement: ComponentConfig<VerticalSpaceElementProps> = {
  label: "Spacer",
  inline: true,
  fields: {
    height: spacingField("Height (desktop)"),
    mobileHeight: spacingField("Height (mobile)"),
    design: designField("element"),
  },
  defaultProps: { design: {}, height: 48, mobileHeight: 24 },
  render: ({ height, mobileHeight, puck }) => (
    <div
      aria-hidden="true"
      className={`layout-spacer${puck.isEditing ? " layout-spacer-editing" : ""}`}
      style={
        {
          "--spacer-height": `${snapSpacing(height, 48)}px`,
          "--spacer-height-mobile": `${snapSpacing(mobileHeight, 24)}px`,
        } as CSSProperties
      }
    />
  ),
};
