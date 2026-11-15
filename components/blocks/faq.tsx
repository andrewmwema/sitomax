import type { ComponentConfig, RichText } from "@puckeditor/core";
import { richTextField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { BlockIcon } from "./ui/icon";
import { RichTextContent } from "./ui/rich-text";

export type FaqProps = {
  eyebrow: string;
  heading: string;
  items: { question: string; answer: RichText }[];
  variant: "accordion" | "two-column";
};

export const Faq: ComponentConfig<FaqProps> = {
  label: "FAQ",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    items: {
      type: "array",
      label: "Questions",
      getItemSummary: (item) => item.question || "Question",
      defaultItemProps: { question: "New question?", answer: "<p>The answer.</p>" },
      arrayFields: {
        question: { type: "text", label: "Question", contentEditable: true },
        answer: richTextField("Answer"),
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Accordion", value: "accordion" },
        { label: "Two columns", value: "two-column" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "FAQ",
    heading: "Frequently asked questions",
    items: [
      { question: "How quickly can you start?", answer: "<p>Usually within a few days.</p>" },
      {
        question: "Do you offer free quotes?",
        answer: "<p>Yes, every quote is free and without obligation.</p>",
      },
    ],
    variant: "accordion",
  },
  render: ({ eyebrow, heading, items, variant }) => {
    if ((variant ?? "accordion") === "two-column") {
      return (
        <Section>
          <div className="flex flex-col gap-12">
            <div className="flex flex-col items-center gap-3 text-center">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
            </div>
            <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
              {items.map((item, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <h3 className="font-semibold" style={{ fontFamily: "var(--font-body)" }}>
                    {item.question}
                  </h3>
                  <RichTextContent value={item.answer} className="w-full max-w-[65ch] text-sm" />
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    return (
      <Section>
        <div className="mx-auto flex max-w-[46rem] flex-col gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Heading level={2}>{heading}</Heading>
          </div>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <details
                key={i}
                className="group px-5 py-4"
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {item.question}
                  <span
                    className="shrink-0 transition-transform group-open:rotate-45"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <BlockIcon name="plus" size={18} />
                  </span>
                </summary>
                <RichTextContent value={item.answer} className="mt-3 w-full max-w-[65ch] text-sm" />
              </details>
            ))}
          </div>
        </div>
      </Section>
    );
  },
};
