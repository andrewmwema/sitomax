import type { ComponentConfig, RichText } from "@puckeditor/core";
import { richTextField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { RichTextContent } from "./ui/rich-text";

export type TextSectionProps = {
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "standard" | "centered" | "two-column";
  /** @deprecated legacy prop, replaced by variant. */
  align?: "left" | "center";
};

export const TextSection: ComponentConfig<TextSectionProps> = {
  label: "Text section",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: richTextField("Text"),
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Standard", value: "standard" },
        { label: "Centered", value: "centered" },
        { label: "Two columns", value: "two-column" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "About us",
    heading: "A team you can rely on",
    text: "<p>Tell your visitors who you are, what you do and why they should choose you.</p>",
    variant: "standard",
  },
  render: ({ eyebrow, heading, text, variant, align }) => {
    const layout = variant ?? (align === "center" ? "centered" : "standard");

    if (layout === "two-column") {
      return (
        <Section>
          <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
            <div className="flex flex-col gap-4">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              {heading ? <Heading level={2}>{heading}</Heading> : null}
            </div>
            <RichTextContent value={text} className="w-full max-w-[65ch]" />
          </div>
        </Section>
      );
    }

    return (
      <Section>
        <div
          className={`flex max-w-[46rem] flex-col gap-4 ${
            layout === "centered" ? "mx-auto items-center text-center" : ""
          }`}
        >
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          {heading ? <Heading level={2}>{heading}</Heading> : null}
          <RichTextContent value={text} className="w-full max-w-[65ch]" />
        </div>
      </Section>
    );
  },
};
