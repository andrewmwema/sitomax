import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { BlockIcon } from "./ui/icon";
import { RichTextContent } from "./ui/rich-text";

export type LogosProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "strip" | "grid";
  logos: { name: string; image: string; imageAlt?: string }[];
};

export const Logos: ComponentConfig<LogosProps> = {
  label: "Logos",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    variant: { type: "radio", label: "Layout", options: [{ label: "Wordmark strip", value: "strip" }, { label: "Partner grid", value: "grid" }] },
    logos: {
      type: "array", label: "Partner logos", getItemSummary: (item) => item.name || "Partner",
      defaultItemProps: { name: "[Partner name]", image: "" },
      arrayFields: { name: { type: "text", label: "Partner name" }, image: imageField("Logo (optional)"),
        imageAlt: { type: "text", label: "Image alt text (defaults to partner name)" } },
    },
  },
  defaultProps: {
    design: {}, eyebrow: "Our connections", heading: "Better together",
    text: "The people and organisations who help make good work possible.",
    variant: "strip",
    logos: [{ name: "[Oak & Co.]", image: "" }, { name: "[Northline]", image: "" }, { name: "[FIELDWORK]", image: "" }, { name: "[Goodkind]", image: "" }],
  },
  render: ({ eyebrow, heading, text, logos, variant }) => (
    <Section background={variant === "grid" ? "soft" : "default"}>
      <div className={variant === "grid" ? "grid items-center gap-10 lg:grid-cols-[1fr_2fr]" : ""}>
        <div className={`flex flex-col gap-3 ${variant === "grid" ? "items-start" : "items-center text-center"}`}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <RichHeading level={2}>{heading}</RichHeading>
          {text ? <RichTextContent value={text} className="max-w-[50ch]" style={{ color: "var(--color-muted)" }} /> : null}
        </div>
        <ul className={`grid grid-cols-2 ${variant === "grid" ? "gap-3" : "mt-[var(--section-gap)] gap-x-8 gap-y-4 md:grid-cols-4"}`}>
          {logos.map((logo, i) => (
            <li key={i} className={`flex min-h-28 min-w-0 items-center justify-center gap-2 px-4 py-6 text-center ${variant === "grid" ? "site-card" : ""}`}
              style={variant === "grid" ? { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" } : { borderBlock: "1px solid var(--color-border)" }}>
              {logo.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logo.image} alt={logo.imageAlt ?? logo.name} loading="lazy" className="h-14 w-full max-w-40 object-contain" />
              ) : (
                <span className="flex min-w-0 flex-wrap items-center justify-center gap-2 text-lg font-semibold sm:text-xl" style={{ fontFamily: i % 2 ? "var(--font-body)" : "var(--font-heading)" }}>
                  <BlockIcon name={["leaf", "building", "sun", "gem"][i % 4]} size={23} />
                  <span className="break-words">{logo.name}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  ),
};
