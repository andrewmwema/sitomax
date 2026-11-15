import type { ComponentConfig } from "@puckeditor/core";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";

export type MapProps = {
  eyebrow: string;
  heading: string;
  address: string;
  variant: "standard" | "split";
};

export const Map: ComponentConfig<MapProps> = {
  label: "Map",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    address: { type: "text", label: "Address", placeholder: "123 Main St, Springfield" },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Standard", value: "standard" },
        { label: "Split", value: "split" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "Location",
    heading: "Find us",
    address: "",
    variant: "standard",
  },
  render: ({ eyebrow, heading, address, variant }) => {
    const map = address ? (
      <iframe
        title={`Map of ${address}`}
        src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
        className="h-80 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" }}
      />
    ) : (
      <div
        className="flex h-80 w-full items-center justify-center text-sm"
        style={{
          backgroundColor: "var(--color-soft-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          color: "var(--color-muted)",
        }}
      >
        Enter an address to show the map
      </div>
    );

    if ((variant ?? "standard") === "split") {
      return (
        <Section>
          <div className="grid items-center gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
            <div className="flex flex-col gap-3">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              {heading ? <Heading level={2}>{heading}</Heading> : null}
              {address ? (
                <p className="text-sm" style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
                  {address}
                </p>
              ) : null}
            </div>
            {map}
          </div>
        </Section>
      );
    }

    return (
      <Section>
        <div className="flex flex-col items-center gap-3 text-center">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          {heading ? <Heading level={2}>{heading}</Heading> : null}
        </div>
        <div className="mt-10">{map}</div>
      </Section>
    );
  },
};
