import type { ComponentConfig } from "@puckeditor/core";
import { imageField } from "@/lib/puck/fields";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";

export type GalleryProps = {
  eyebrow: string;
  heading: string;
  images: { url: string; alt: string }[];
  columns: "2" | "3" | "4";
  variant: "grid" | "masonry";
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
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    images: {
      type: "array",
      label: "Images",
      getItemSummary: (item, i) => item.alt || `Image ${(i ?? 0) + 1}`,
      defaultItemProps: { url: "", alt: "" },
      arrayFields: {
        url: imageField("Image"),
        alt: { type: "text", label: "Alt text" },
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
      ],
    },
  },
  defaultProps: {
    eyebrow: "Our work",
    heading: "Gallery",
    images: [],
    columns: "3",
    variant: "grid",
  },
  render: ({ eyebrow, heading, images, columns, variant }) => (
    <Section>
      <div className="flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {heading ? <Heading level={2}>{heading}</Heading> : null}
      </div>
      {(variant ?? "grid") === "masonry" ? (
        <div className={`mt-12 columns-1 gap-4 ${MASONRY_CLASSES[columns] ?? MASONRY_CLASSES["3"]}`}>
          {images.map((image, i) =>
            image.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={image.url}
                alt={image.alt}
                loading="lazy"
                className="mb-4 w-full break-inside-avoid object-cover"
                style={{ borderRadius: "var(--radius-lg)" }}
              />
            ) : (
              <div
                key={i}
                className={`mb-4 w-full break-inside-avoid ${
                  MASONRY_PLACEHOLDER_HEIGHTS[i % MASONRY_PLACEHOLDER_HEIGHTS.length]
                }`}
                style={{
                  backgroundColor: "var(--color-soft-bg)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                }}
              />
            ),
          )}
        </div>
      ) : (
        <div className={`mt-12 grid grid-cols-1 gap-4 ${COLUMN_CLASSES[columns] ?? COLUMN_CLASSES["3"]}`}>
          {images.map((image, i) =>
            image.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={image.url}
                alt={image.alt}
                loading="lazy"
                className="aspect-square w-full object-cover"
                style={{ borderRadius: "var(--radius-lg)" }}
              />
            ) : (
              <div
                key={i}
                className="aspect-square w-full"
                style={{
                  backgroundColor: "var(--color-soft-bg)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                }}
              />
            ),
          )}
        </div>
      )}
    </Section>
  ),
};
