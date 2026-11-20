import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { SiteImage } from "./ui/site-image";
import { RichTextContent } from "./ui/rich-text";

export type GalleryProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  images: { url: string; alt: string; caption?: string }[];
  columns: "2" | "3" | "4";
  variant: "grid" | "masonry" | "featured" | "portfolio-rows" | "portfolio-cards" | "portfolio-feature";
  text?: RichText;
};

const COLUMN_CLASSES: Record<GalleryProps["columns"], string> = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
};

const MASONRY_CLASSES: Record<GalleryProps["columns"], string> = {
  "2": "sm:columns-2",
  "3": "sm:columns-2 lg:columns-3",
  "4": "sm:columns-2 lg:columns-4",
};

/** Varied placeholder heights so an empty masonry still reads as masonry. */
const MASONRY_PLACEHOLDER_HEIGHTS = ["h-48", "h-64", "h-40", "h-56"];

export const Gallery: ComponentConfig<GalleryProps> = {
  label: "Gallery",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    images: {
      type: "array",
      label: "Images",
      getItemSummary: (item, i) => item.alt || `Image ${(i ?? 0) + 1}`,
      defaultItemProps: { url: "", alt: "" },
      arrayFields: {
        url: imageField("Image"),
        alt: { type: "text", label: "Alt text" },
        caption: { type: "text", label: "Caption" },
      },
    },
    columns: {
      type: "select",
      label: "Columns",
      options: [
        { label: "2", value: "2" },
        { label: "3", value: "3" },
        { label: "4", value: "4" },
      ],
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Grid", value: "grid" },
        { label: "Masonry", value: "masonry" },
        { label: "Featured project", value: "featured" },
        { label: "Portfolio rows", value: "portfolio-rows" },
        { label: "Portfolio cards", value: "portfolio-cards" },
        { label: "Portfolio feature", value: "portfolio-feature" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "Our work",
    heading: "Gallery",
    images: [],
    columns: "3",
    variant: "grid",
    text: "",
  },
  render: ({ eyebrow, heading, images, columns, variant, text }) => (
    <Section>
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {heading ? <RichHeading level={2}>{heading}</RichHeading> : null}
        {text ? <RichTextContent value={text} className="max-w-[55ch]" style={{ color: "var(--color-muted)" }} /> : null}
      </div>
      {variant === "portfolio-rows" ? (
        <div className="mt-[var(--section-gap)] flex flex-col gap-10 md:gap-16">
          {images.map((image, i) => <figure key={i} className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
            {image.url ? (
              <SiteImage src={image.url} alt={image.alt}
                className={`aspect-[4/3] w-full rounded-[var(--radius-lg)] object-cover ${i % 2 ? "md:order-2" : ""}`} />
            ) : <div className="aspect-[4/3] rounded-[var(--radius-lg)] bg-[var(--color-soft-bg)]" />}
            <figcaption className="border-t py-5" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-sm" style={{ color: "var(--color-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-3 text-xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{image.caption}</p>
            </figcaption>
          </figure>)}
        </div>
      ) : variant === "portfolio-cards" || variant === "portfolio-feature" ? (
        <div className={`mt-[var(--section-gap)] grid gap-6 sm:grid-cols-2 ${variant === "portfolio-cards" ? "lg:grid-cols-3" : ""}`}>
          {images.map((image, i) => <figure key={i} className={`min-w-0 ${variant === "portfolio-feature" && i === 0 ? "sm:col-span-2" : ""}`}>
            {image.url ? (
              <SiteImage src={image.url} alt={image.alt} className={`w-full rounded-[var(--radius-lg)] object-cover ${variant === "portfolio-feature" && i === 0 ? "aspect-[16/9]" : "aspect-[4/3]"}`} />
            ) : <div className="aspect-[4/3] rounded-[var(--radius-lg)] bg-[var(--color-soft-bg)]" />}
            {image.caption ? <figcaption className="border-b py-4 text-base font-semibold" style={{ borderColor: "var(--color-border)" }}>{image.caption}</figcaption> : null}
          </figure>)}
        </div>
      ) : variant === "featured" ? (
        <div className="mt-[var(--section-gap)] grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((image, i) => (
            <figure key={i} className={`relative isolate min-h-52 overflow-hidden rounded-[var(--radius-lg)] ${i === 0 ? "sm:col-span-2 lg:row-span-2" : "aspect-[4/3]"}`}>
              {image.url ? (
                <SiteImage src={image.url} alt={image.alt} className="h-full w-full object-cover" style={{ height: "100%" }} />
              ) : <div className="h-full min-h-64 bg-[var(--color-soft-bg)]" />}
              {image.caption ? <figcaption className="absolute inset-x-0 bottom-0 px-6 pb-5 pt-16 text-lg font-semibold" style={{ color: "white", background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }}>{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : (variant ?? "grid") === "masonry" ? (
        <div className={`mt-[var(--section-gap)] columns-1 gap-4 ${MASONRY_CLASSES[columns] ?? MASONRY_CLASSES["3"]}`}>
          {images.map((image, i) => (
            <figure key={i} className="mb-[var(--detail-gap)] break-inside-avoid">
              {image.url ? (
                <SiteImage
                  src={image.url}
                  alt={image.alt}
                  className="w-full object-cover"
                  style={{ borderRadius: "var(--radius-lg)", aspectRatio: i % 2 ? "4/5" : "4/3" }}
                />
              ) : (
                <div
                  className={`w-full ${MASONRY_PLACEHOLDER_HEIGHTS[i % MASONRY_PLACEHOLDER_HEIGHTS.length]}`}
                  style={{
                    backgroundColor: "var(--color-soft-bg)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                  }}
                />
              )}
              {image.caption ? <figcaption className="py-3 text-sm" style={{ color: "var(--color-muted)" }}>{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : (
        <div className={`mt-[var(--section-gap)] grid grid-cols-1 gap-4 ${COLUMN_CLASSES[columns] ?? COLUMN_CLASSES["3"]}`}>
          {images.map((image, i) => (
            <figure key={i}>
              {image.url ? (
                <SiteImage
                  src={image.url}
                  alt={image.alt}
                  className="aspect-square w-full object-cover"
                  style={{ borderRadius: "var(--radius-lg)" }}
                />
              ) : (
                <div
                  className="aspect-square w-full"
                  style={{
                    backgroundColor: "var(--color-soft-bg)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                  }}
                />
              )}
              {image.caption ? <figcaption className="py-3 text-sm" style={{ color: "var(--color-muted)" }}>{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      )}
    </Section>
  ),
};
