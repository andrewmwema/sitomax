import type { ComponentConfig } from "@puckeditor/core";
import { imageField } from "@/lib/puck/fields";

export type HeroProps = {
  heading: string;
  subheading: string;
  buttonText: string;
  buttonLink: string;
  backgroundImage: string;
  layout: "centered" | "split";
};

export const Hero: ComponentConfig<HeroProps> = {
  label: "Hero",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    subheading: { type: "textarea", label: "Subheading", contentEditable: true },
    buttonText: { type: "text", label: "Button text" },
    buttonLink: { type: "text", label: "Button link", placeholder: "/contact" },
    backgroundImage: imageField("Background image"),
    layout: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Centered", value: "centered" },
        { label: "Split", value: "split" },
      ],
    },
  },
  defaultProps: {
    heading: "Grow your business with us",
    subheading: "We make it easy for your customers to find and contact you.",
    buttonText: "Get in touch",
    buttonLink: "/contact",
    backgroundImage: "",
    layout: "centered",
  },
  render: ({ heading, subheading, buttonText, buttonLink, backgroundImage, layout }) => {
    const button = buttonText ? (
      <a
        href={buttonLink || "#"}
        className="inline-block rounded-lg px-6 py-3 text-base font-semibold text-white shadow-md transition hover:opacity-90"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        {buttonText}
      </a>
    ) : null;

    if (layout === "split") {
      return (
        <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
            <div className="flex flex-col items-start gap-5">
              <h1
                className="text-4xl leading-tight font-bold sm:text-5xl"
                style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
              >
                {heading}
              </h1>
              <p className="text-lg opacity-80" style={{ color: "var(--color-text)" }}>
                {subheading}
              </p>
              {button}
            </div>
            {backgroundImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={backgroundImage}
                alt=""
                className="h-64 w-full rounded-2xl object-cover shadow-lg sm:h-80 md:h-96"
              />
            ) : (
              <div
                className="h-64 w-full rounded-2xl sm:h-80 md:h-96"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                }}
              />
            )}
          </div>
        </section>
      );
    }

    return (
      <section
        className="relative w-full bg-cover bg-center"
        style={
          backgroundImage
            ? { backgroundImage: `url(${backgroundImage})` }
            : { backgroundColor: "var(--color-primary)" }
        }
      >
        {backgroundImage ? <div className="absolute inset-0 bg-black/50" /> : null}
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 md:py-32">
          <h1
            className="text-4xl leading-tight font-bold text-white sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h1>
          <p className="max-w-2xl text-lg text-white/85">{subheading}</p>
          {buttonText ? (
            <a
              href={buttonLink || "#"}
              className="inline-block rounded-lg bg-white px-6 py-3 text-base font-semibold shadow-md transition hover:opacity-90"
              style={{ color: "var(--color-primary)" }}
            >
              {buttonText}
            </a>
          ) : null}
        </div>
      </section>
    );
  },
};
