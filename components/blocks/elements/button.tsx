import type { ComponentConfig } from "@puckeditor/core";
import { designField, linkField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import { JUSTIFY, oneOf, safeAlign, type Align } from "@/lib/layout/guardrails";
import type { BlockDesign } from "@/lib/sections/design";
import { Button } from "../ui/button";

type ButtonSize = "sm" | "md" | "lg";

export type ButtonElementProps = {
  design?: BlockDesign;
  label: string;
  href: LinkValue;
  /** Legacy: only applies to plain-string links; the link picker stores its own new-tab option. */
  newTab?: boolean;
  variant: "primary" | "secondary" | "ghost";
  size: ButtonSize;
  align: Align | "full";
};

const SIZES: Record<ButtonSize, { minHeight: number; padding: string; fontSize: string }> = {
  sm: { minHeight: 40, padding: "8px 16px", fontSize: "0.875rem" },
  md: { minHeight: 48, padding: "12px 24px", fontSize: "1rem" },
  lg: { minHeight: 56, padding: "16px 32px", fontSize: "1.125rem" },
};

export const ButtonElement: ComponentConfig<ButtonElementProps> = {
  label: "Button",
  inline: true,
  fields: {
    label: { type: "text", label: "Label", contentEditable: true },
    href: linkField("Link"),
    variant: {
      type: "select",
      label: "Style",
      options: [
        { label: "Primary", value: "primary" },
        { label: "Outline", value: "secondary" },
        { label: "Text link", value: "ghost" },
      ],
    },
    size: {
      type: "radio",
      label: "Size",
      options: [
        { label: "S", value: "sm" },
        { label: "M", value: "md" },
        { label: "L", value: "lg" },
      ],
    },
    align: {
      type: "select",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
        { label: "Full width", value: "full" },
      ],
    },
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    label: "Get in touch",
    href: "/contact",
    newTab: false,
    variant: "primary",
    size: "md",
    align: "left",
  },
  render: ({ label, href, newTab, variant, size, align, puck }) => {
    const full = align === "full";
    return (
      <div className="flex" style={{ justifyContent: `var(--shell-justify, ${JUSTIFY[safeAlign(align)]})` }}>
        <Button
          href={href}
          newTab={newTab === true && typeof href === "string"}
          variant={oneOf(variant, ["primary", "secondary", "ghost"], "primary")}
          className={full ? "w-full" : ""}
          style={SIZES[oneOf(size, ["sm", "md", "lg"], "md")]}
          onClick={puck.isEditing ? (event) => event.preventDefault() : undefined}
        >
          {label || "Button"}
        </Button>
      </div>
    );
  },
};
