import type { ComponentConfig } from "@puckeditor/core";

export type SpacerProps = {
  size: "small" | "medium" | "large" | "extra-large";
};

const SIZES: Record<SpacerProps["size"], string> = {
  small: "h-6",
  medium: "h-12",
  large: "h-20",
  "extra-large": "h-32",
};

export const Spacer: ComponentConfig<SpacerProps> = {
  label: "Spacer",
  fields: {
    size: {
      type: "select",
      label: "Size",
      options: [
        { label: "Small", value: "small" },
        { label: "Medium", value: "medium" },
        { label: "Large", value: "large" },
        { label: "Extra large", value: "extra-large" },
      ],
    },
  },
  defaultProps: { size: "medium" },
  render: ({ size }) => (
    <div
      aria-hidden="true"
      className={`w-full ${SIZES[size] ?? SIZES.medium}`}
      style={{ backgroundColor: "var(--color-background)" }}
    />
  ),
};
