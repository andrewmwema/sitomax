import type { ComponentConfig } from "@puckeditor/core";
import { imageField } from "@/lib/puck/fields";

export type ImageWithTextProps = {
  image: string;
  imageAlt: string;
  heading: string;
  text: string;
  imageSide: "left" | "right";
};

export const ImageWithText: ComponentConfig<ImageWithTextProps> = {
  label: "Image with text",
  fields: {
    image: imageField("Image"),
    imageAlt: { type: "text", label: "Image alt text" },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: { type: "textarea", label: "Text", contentEditable: true },
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
    heading: "Why choose us",
    text: "Share what makes your business different.",
    imageSide: "left",
  },
  render: ({ image, imageAlt, heading, text, imageSide }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16">
        <div className={imageSide === "right" ? "md:order-2" : ""}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt={imageAlt}
              className="h-64 w-full rounded-2xl object-cover shadow-md sm:h-80"
            />
          ) : (
            <div
              className="h-64 w-full rounded-2xl sm:h-80"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-secondary), var(--color-primary))",
              }}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h2
            className="text-3xl font-bold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h2>
          <p
            className="text-base leading-relaxed whitespace-pre-line opacity-80"
            style={{ color: "var(--color-text)" }}
          >
            {text}
          </p>
        </div>
      </div>
    </section>
  ),
};
