import type { ComponentConfig } from "@puckeditor/core";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Button } from "./ui/button";

export type CallToActionProps = {
  eyebrow: string;
  heading: string;
  text: string;
  buttonText: string;
  buttonLink: string;
  variant: "dark" | "primary" | "split";
};

export const CallToAction: ComponentConfig<CallToActionProps> = {
  label: "Call to action",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: { type: "textarea", label: "Text", contentEditable: true },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: { type: "text", label: "Button link" },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Dark band", value: "dark" },
        { label: "Primary band", value: "primary" },
        { label: "Split", value: "split" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "Get started",
    heading: "Ready to get started?",
    text: "Contact us today for a free, no-obligation quote.",
    buttonText: "Contact us",
    buttonLink: "/contact",
    variant: "dark",
  },
  render: ({ eyebrow, heading, text, buttonText, buttonLink, variant }) => {
    const layout = variant ?? "dark";

    if (layout === "split") {
      return (
        <Section background="soft">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="flex max-w-2xl flex-col gap-4">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
              <p className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
                {text}
              </p>
            </div>
            {buttonText ? (
              <Button href={buttonLink} className="shrink-0">
                {buttonText}
              </Button>
            ) : null}
          </div>
        </Section>
      );
    }

    return (
      <Section background={layout === "primary" ? "primary" : "dark"}>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={2}>{heading}</Heading>
          <p className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
            {text}
          </p>
          {buttonText ? (
            <Button href={buttonLink} variant={layout === "primary" ? "secondary" : "primary"}>
              {buttonText}
            </Button>
          ) : null}
        </div>
      </Section>
    );
  },
};
