import type { ComponentConfig } from "@puckeditor/core";
import { imageField } from "@/lib/puck/fields";

export type GalleryProps = {
  heading: string;
  images: { url: string; alt: string }[];
  columns: "2" | "3" | "4";
};

const COLUMN_CLASSES: Record<GalleryProps["columns"], string> = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
};

export const Gallery: ComponentConfig<GalleryProps> = {
  label: "Gallery",
  fields: {
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
  },
  defaultProps: {
    heading: "Gallery",
    images: [],
    columns: "3",
  },
  render: ({ heading, images, columns }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:py-16">
        {heading ? (
          <h2
            className="text-center text-3xl font-bold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h2>
        ) : null}
        <div className={`grid grid-cols-1 gap-4 ${COLUMN_CLASSES[columns] ?? COLUMN_CLASSES["3"]}`}>
          {images.map((image, i) =>
            image.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={image.url}
                alt={image.alt}
                loading="lazy"
                className="aspect-square w-full rounded-xl object-cover"
              />
            ) : (
              <div
                key={i}
                className="aspect-square w-full rounded-xl"
                style={{
                  background:
                    "color-mix(in srgb, var(--color-secondary) 25%, var(--color-background))",
                }}
              />
            ),
          )}
        </div>
      </div>
    </section>
  ),
};
