import type { ComponentConfig } from "@puckeditor/core";

export type CallToActionProps = {
  heading: string;
  text: string;
  buttonText: string;
  buttonLink: string;
};

export const CallToAction: ComponentConfig<CallToActionProps> = {
  label: "Call to action",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: { type: "textarea", label: "Text", contentEditable: true },
    buttonText: { type: "text", label: "Button text" },
    buttonLink: { type: "text", label: "Button link" },
  },
  defaultProps: {
    heading: "Ready to get started?",
    text: "Contact us today for a free, no-obligation quote.",
    buttonText: "Contact us",
    buttonLink: "/contact",
  },
  render: ({ heading, text, buttonText, buttonLink }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-primary)" }}>
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 py-14 text-center sm:px-6 md:py-20">
        <h2
          className="text-3xl font-bold text-white"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {heading}
        </h2>
        <p className="max-w-xl text-white/85">{text}</p>
        {buttonText ? (
          <a
            href={buttonLink || "#"}
            className="rounded-lg bg-white px-6 py-3 text-base font-semibold shadow-md transition hover:opacity-90"
            style={{ color: "var(--color-primary)" }}
          >
            {buttonText}
          </a>
        ) : null}
      </div>
    </section>
  ),
};
