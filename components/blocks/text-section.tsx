import type { ComponentConfig } from "@puckeditor/core";

export type TextSectionProps = {
  heading: string;
  text: string;
  align: "left" | "center";
};

export const TextSection: ComponentConfig<TextSectionProps> = {
  label: "Text section",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: { type: "textarea", label: "Text", contentEditable: true },
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
    heading: "About us",
    text: "Tell your visitors who you are, what you do and why they should choose you.",
    align: "left",
  },
  render: ({ heading, text, align }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div
        className={`mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12 sm:px-6 md:py-16 ${
          align === "center" ? "items-center text-center" : ""
        }`}
      >
        {heading ? (
          <h2
            className="text-3xl font-bold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h2>
        ) : null}
        <p
          className="text-base leading-relaxed whitespace-pre-line opacity-80"
          style={{ color: "var(--color-text)" }}
        >
          {text}
        </p>
      </div>
    </section>
  ),
};
