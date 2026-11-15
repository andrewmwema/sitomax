import type { ComponentConfig } from "@puckeditor/core";

export type FaqProps = {
  heading: string;
  items: { question: string; answer: string }[];
};

export const Faq: ComponentConfig<FaqProps> = {
  label: "FAQ",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    items: {
      type: "array",
      label: "Questions",
      getItemSummary: (item) => item.question || "Question",
      defaultItemProps: { question: "New question?", answer: "The answer." },
      arrayFields: {
        question: { type: "text", label: "Question" },
        answer: { type: "textarea", label: "Answer" },
      },
    },
  },
  defaultProps: {
    heading: "Frequently asked questions",
    items: [
      { question: "How quickly can you start?", answer: "Usually within a few days." },
      { question: "Do you offer free quotes?", answer: "Yes, every quote is free and without obligation." },
    ],
  },
  render: ({ heading, items }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 md:py-16">
        <h2
          className="text-center text-3xl font-bold"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
        >
          {heading}
        </h2>
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border px-5 py-4"
              style={{ borderColor: "color-mix(in srgb, var(--color-text) 12%, transparent)" }}
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden"
                style={{ color: "var(--color-text)" }}
              >
                {item.question}
                <span
                  className="transition-transform group-open:rotate-45"
                  style={{ color: "var(--color-primary)" }}
                >
                  +
                </span>
              </summary>
              <p
                className="mt-3 text-sm leading-relaxed whitespace-pre-line opacity-80"
                style={{ color: "var(--color-text)" }}
              >
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  ),
};
