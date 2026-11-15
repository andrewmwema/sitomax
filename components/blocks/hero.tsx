import type { ComponentConfig } from "@puckeditor/core";
import { imageField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Button } from "./ui/button";

export type HeroProps = {
  eyebrow: string;
  heading: string;
  subheading: string;
  buttonText: string;
  buttonLink: string;
  backgroundImage: string;
  variant: "centered" | "split";
  /** @deprecated legacy prop, replaced by variant. */
  layout?: "centered" | "split";
};

export const Hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    subheading: { type: "textarea", label: "Subheading", contentEditable: true },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: { type: "text", label: "Button link", placeholder: "/contact" },
    backgroundImage: imageField("Image"),
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Centered", value: "centered" },
        { label: "Split", value: "split" },
      ],
    },
  },
  defaultProps: {
    eyebrow: "Trusted local experts",
    heading: "Grow your business with us",
    subheading: "We make it easy for your customers to find and contact you.",
    buttonText: "Get in touch",
    buttonLink: "/contact",
    backgroundImage: "",
    variant: "centered",
  },
  render: ({ eyebrow, heading, subheading, buttonText, buttonLink, backgroundImage, variant, layout }) => {
    if ((variant ?? layout) === "split") {
      return (
        <Section container={false}>
          <Container className="grid items-center gap-12 md:grid-cols-2">
            <div className="flex flex-col items-start gap-5">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={1}>{heading}</Heading>
              <p
                className="max-w-[65ch] text-lg"
                style={{ color: "var(--color-muted)", lineHeight: 1.6 }}
              >
                {subheading}
              </p>
              {buttonText ? <Button href={buttonLink}>{buttonText}</Button> : null}
            </div>
            {backgroundImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={backgroundImage}
                alt=""
                className="h-72 w-full object-cover sm:h-96"
                style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" }}
              />
            ) : (
              <div
                className="h-72 w-full sm:h-96"
                style={{
                  backgroundColor: "var(--color-soft-bg)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                }}
              />
            )}
          </Container>
        </Section>
      );
    }

    return (
      <Section
        background="dark"
        container={false}
        className="relative overflow-hidden"
        style={
          backgroundImage
            ? {
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {backgroundImage ? (
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(10, 14, 20, 0.62)" }} />
        ) : null}
        <Container className="relative flex max-w-3xl flex-col items-center gap-6 text-center">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={1} style={backgroundImage ? { color: "#ffffff" } : undefined}>
            {heading}
          </Heading>
          <p
            className="max-w-[55ch] text-lg"
            style={{
              color: backgroundImage ? "rgba(255,255,255,0.82)" : "var(--color-muted)",
              lineHeight: 1.6,
            }}
          >
            {subheading}
          </p>
          {buttonText ? <Button href={buttonLink}>{buttonText}</Button> : null}
        </Container>
      </Section>
    );
  },
};
