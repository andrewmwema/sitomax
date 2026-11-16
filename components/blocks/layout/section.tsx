import type { CSSProperties } from "react";
import type { ComponentConfig, Slot } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import { spacingField } from "@/lib/puck/layout-fields";
import { oneOf, snapSpacing, type SpacingStep } from "@/lib/layout/guardrails";
import { blankSection, type LayoutItem } from "@/lib/layout/structure";
import type { BlockDesign } from "@/lib/sections/design";
import { Section, type SectionBackground } from "../ui/section";

export type LayoutSectionWidth = "narrow" | "contained" | "wide" | "full";

export type LayoutSectionProps = {
  design?: BlockDesign;
  background: SectionBackground;
  width: LayoutSectionWidth;
  rowGap: SpacingStep;
  rows: Slot;
};

const WIDTHS: Record<LayoutSectionWidth, string | undefined> = {
  narrow: "768px",
  contained: "var(--container)",
  wide: "1440px",
  full: undefined,
};

/**
 * Custom layout: a full-width section holding Rows. Uses the same
 * Section primitive as the designed blocks, so theme backgrounds,
 * vertical rhythm and the design controls behave identically.
 */
export const LayoutSection: ComponentConfig<LayoutSectionProps> = {
  label: "Section",
  inline: true,
  fields: {
    design: designField("section"),
    background: {
      type: "select",
      label: "Theme background",
      options: [
        { label: "Default", value: "default" },
        { label: "Soft", value: "soft" },
        { label: "Dark", value: "dark" },
        { label: "Primary", value: "primary" },
      ],
    },
    width: {
      type: "select",
      label: "Content width",
      options: [
        { label: "Narrow", value: "narrow" },
        { label: "Contained", value: "contained" },
        { label: "Wide", value: "wide" },
        { label: "Full width", value: "full" },
      ],
    },
    rowGap: spacingField("Space between rows"),
    rows: { type: "slot", allow: ["Row"] },
  },
  defaultProps: {
    design: {},
    background: "default",
    width: "contained",
    rowGap: 48,
    rows: [],
  },
  // A section dropped in from the component list starts with one row.
  resolveData: (data, { trigger }) => {
    if (trigger !== "insert" || (data.props.rows?.length ?? 0) > 0) return data;
    const rows = (blankSection().props.rows as LayoutItem[]) as Slot;
    return { ...data, props: { ...data.props, rows } };
  },
  render: ({ background, width, rowGap, rows: Rows }) => {
    const safeWidth = oneOf(width, ["narrow", "contained", "wide", "full"], "contained");
    return (
      <Section
        background={oneOf(background, ["default", "soft", "dark", "primary"], "default")}
        container={false}
      >
        <div
          className={`mx-auto w-full ${safeWidth === "full" ? "" : "px-5 sm:px-8"}`}
          style={{ maxWidth: WIDTHS[safeWidth] }}
        >
          <Rows
            className="layout-section-rows"
            style={{ "--rows-gap": `${snapSpacing(rowGap, 48)}px` } as CSSProperties}
          />
        </div>
      </Section>
    );
  },
};
