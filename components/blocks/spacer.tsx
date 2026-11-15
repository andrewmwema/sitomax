import type { ComponentConfig } from "@puckeditor/core";

export type SpacerProps = {
  size: "small" | "medium" | "large" | "extra-large";
  variant: "blank" | "divider";
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
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Blank", value: "blank" },
        { label: "Divider line", value: "divider" },
      ],
    },
  },
  defaultProps: { size: "medium", variant: "blank" },
  render: ({ size, variant }) => (
    <div
      aria-hidden="true"
      className={`flex w-full items-center ${SIZES[size] ?? SIZES.medium}`}
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {(variant ?? "blank") === "divider" ? (
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: "var(--container)",
            borderTop: "1px solid var(--color-border)",
          }}
        />
      ) : null}
    </div>
  ),
};
