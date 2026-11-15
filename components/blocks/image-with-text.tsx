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
  imageSide: "left" | "right";
};

export const ImageWithText: ComponentConfig<ImageWithTextProps> = {
  label: "Image with text",
  fields: {
    image: imageField("Image"),
    imageAlt: { type: "text", label: "Image alt text" },
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: richTextField("Text"),
    imageSide: {
      type: "radio",
      label: "Image side",
      options: [
        { label: "Left", value: "left" },
        { label: "Right", value: "right" },
      ],
    },
  },
  defaultProps: {
    image: "",
    imageAlt: "",
    eyebrow: "Why choose us",
    heading: "Experience that shows",
    text: "<p>Share what makes your business different.</p>",
    imageSide: "left",
  },
  render: ({ image, imageAlt, eyebrow, heading, text, imageSide }) => (
    <Section container={false}>
      <Container className="grid items-center gap-12 md:grid-cols-2">
        <div className={imageSide === "right" ? "md:order-2" : ""}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt={imageAlt}
              className="h-72 w-full object-cover sm:h-80"
              style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" }}
            />
          ) : (
            <div
              className="h-72 w-full sm:h-80"
              style={{
                backgroundColor: "var(--color-soft-bg)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={2}>{heading}</Heading>
          <RichTextContent value={text} className="w-full max-w-[65ch]" />
        </div>
      </Container>
    </Section>
  ),
};
