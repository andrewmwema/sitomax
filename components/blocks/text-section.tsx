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
  align: "left" | "center";
};

export const TextSection: ComponentConfig<TextSectionProps> = {
  label: "Text section",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: richTextField("Text"),
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "About us",
    heading: "A team you can rely on",
    text: "<p>Tell your visitors who you are, what you do and why they should choose you.</p>",
    align: "left",
  },
  render: ({ eyebrow, heading, text, align }) => (
    <Section>
      <div
        className={`flex max-w-[46rem] flex-col gap-4 ${
          align === "center" ? "mx-auto items-center text-center" : ""
        }`}
      >
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {heading ? <Heading level={2}>{heading}</Heading> : null}
        <RichTextContent value={text} className="w-full max-w-[65ch]" />
      </div>
    </Section>
  ),
};
