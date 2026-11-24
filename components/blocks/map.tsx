import type { ComponentConfig } from "@puckeditor/core";
import { designField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";

export type MapProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  address: string;
  variant: "standard" | "split";
};

export const Map: ComponentConfig<MapProps> = {
  label: "Map",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
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
    design: {},
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
            <div className="section-intro flex flex-col gap-3">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              {heading ? <RichHeading level={2}>{heading}</RichHeading> : null}
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
        <div className="section-intro flex flex-col items-center gap-3 text-center">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          {heading ? <RichHeading level={2}>{heading}</RichHeading> : null}
        </div>
        <div className="mt-[var(--section-gap)]">{map}</div>
      </Section>
    );
  },
};
