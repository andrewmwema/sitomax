import type { ComponentConfig, RichText } from "@puckeditor/core";
import { imageField, richTextField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { RichTextContent } from "./ui/rich-text";

export type ImageWithTextProps = {
  image: string;
  imageAlt: string;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "image-left" | "image-right" | "stacked";
  /** @deprecated legacy prop, replaced by variant. */
  imageSide?: "left" | "right";
};

export const ImageWithText: ComponentConfig<ImageWithTextProps> = {
  label: "Image with text",
  fields: {
    image: imageField("Image"),
    imageAlt: { type: "text", label: "Image alt text" },
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: richTextField("Text"),
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Image left", value: "image-left" },
        { label: "Image right", value: "image-right" },
        { label: "Stacked", value: "stacked" },
      ],
    },
  },
  defaultProps: {
    image: "",
    imageAlt: "",
    eyebrow: "Why choose us",
    heading: "Experience that shows",
    text: "<p>Share what makes your business different.</p>",
    variant: "image-left",
  },
  render: ({ image, imageAlt, eyebrow, heading, text, variant, imageSide }) => {
    const layout =
      variant ?? (imageSide === "right" ? "image-right" : "image-left");

    const imageElement = image ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={image}
        alt={imageAlt}
        className={`w-full object-cover ${layout === "stacked" ? "h-80 sm:h-[26rem]" : "h-72 sm:h-80"}`}
        style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" }}
      />
    ) : (
      <div
        className={`w-full ${layout === "stacked" ? "h-80 sm:h-[26rem]" : "h-72 sm:h-80"}`}
        style={{
          backgroundColor: "var(--color-soft-bg)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
        }}
      />
    );

    if (layout === "stacked") {
      return (
        <Section container={false}>
          <Container className="flex flex-col gap-10">
            <div className="mx-auto flex max-w-[46rem] flex-col items-center gap-4 text-center">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
              <RichTextContent value={text} className="w-full max-w-[65ch]" />
            </div>
            {imageElement}
          </Container>
        </Section>
      );
    }

    return (
      <Section container={false}>
        <Container className="grid items-center gap-12 md:grid-cols-2">
          <div className={layout === "image-right" ? "md:order-2" : ""}>{imageElement}</div>
          <div className="flex flex-col gap-4">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Heading level={2}>{heading}</Heading>
            <RichTextContent value={text} className="w-full max-w-[65ch]" />
          </div>
        </Container>
      </Section>
    );
  },
};
