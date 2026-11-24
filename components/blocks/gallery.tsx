import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, imageField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { SiteImage } from "./ui/site-image";
import { RichTextContent } from "./ui/rich-text";
import { Button } from "./ui/button";

export type GalleryProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  images: { url: string; alt: string; caption?: string }[];
  columns: "2" | "3" | "4";
  variant: "grid" | "masonry" | "featured" | "portfolio-rows" | "portfolio-cards" | "portfolio-feature" | "portfolio-asymmetric" | "case-study";
  text?: RichText;
  caseStudyChallenge?: RichText;
  caseStudyApproach?: RichText;
  caseStudyResults?: RichText;
  caseStudyMetrics?: { value: string; label: string }[];
  nextProjectText?: string;
  nextProjectLink?: LinkValue;
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
    caseStudyChallenge: richTextField("Case study challenge"),
    caseStudyApproach: richTextField("Case study approach"),
    caseStudyResults: richTextField("Case study results"),
    caseStudyMetrics: {
      type: "array",
      label: "Case study results",
      getItemSummary: (item) => `${item.value || ""} ${item.label || "Result"}`.trim(),
      defaultItemProps: { value: "[32]%", label: "Improvement" },
      arrayFields: {
        value: { type: "text", label: "Value", contentEditable: true },
        label: { type: "text", label: "Label", contentEditable: true },
      },
    },
    nextProjectText: { type: "text", label: "Next project button", contentEditable: true },
    nextProjectLink: linkField("Next project link"),
    images: {
      type: "array",
      label: "Images",
      getItemSummary: (item, i) => item.alt || `Image ${(i ?? 0) + 1}`,
      defaultItemProps: { url: "", alt: "" },
      arrayFields: {
        url: imageField("Image", ["1/1", "4/3", "4/5", "16/9"]),
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
        { label: "Asymmetric portfolio", value: "portfolio-asymmetric" },
        { label: "Case study", value: "case-study" },
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
  render: ({
    eyebrow, heading, images, columns, variant, text, caseStudyChallenge,
    caseStudyApproach, caseStudyResults, caseStudyMetrics = [], nextProjectText, nextProjectLink,
  }) => (
    <Section>
      <div className="section-intro flex flex-col items-center gap-3 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {heading ? <RichHeading level={2}>{heading}</RichHeading> : null}
        {text ? <RichTextContent value={text} className="max-w-[55ch]" style={{ color: "var(--color-muted)" }} /> : null}
      </div>
      {variant === "case-study" ? (
        <article className="mt-[var(--section-gap)]">
          {images[0] ? (
            <figure className="relative left-1/2 w-screen max-w-none -translate-x-1/2 overflow-hidden">
              {images[0].url ? (
                <SiteImage src={images[0].url} alt={images[0].alt} className="aspect-[16/8] max-h-[42rem] w-full object-cover" />
              ) : <div className="aspect-[16/8] max-h-[42rem] w-full" style={{ background: "var(--color-soft-bg)" }} />}
              {images[0].caption ? (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-6 pt-16 pb-6 text-lg font-semibold text-white sm:px-12 sm:pb-10">
                  {images[0].caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}
          <div className="mt-[var(--section-gap)] grid gap-8 md:grid-cols-3">
            {[
              { label: "Challenge", content: caseStudyChallenge },
              { label: "Approach", content: caseStudyApproach },
              { label: "Results", content: caseStudyResults },
            ].map(({ label, content }) => (
              <section key={String(label)} className="border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-secondary)" }}>{label}</h3>
                {content ? <RichTextContent value={content} className="w-full text-sm" /> : null}
              </section>
            ))}
          </div>
          {caseStudyMetrics.length ? (
            <dl className="mt-10 grid grid-cols-2 gap-5 border-y py-7 sm:grid-cols-4" style={{ borderColor: "var(--color-border)" }}>
              {caseStudyMetrics.map((metric, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <dt className="text-sm" style={{ color: "var(--color-muted)" }}>{metric.label}</dt>
                  <dd className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{metric.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {nextProjectText ? <div className="mt-8"><Button href={nextProjectLink}>{nextProjectText}</Button></div> : null}
        </article>
      ) : variant === "portfolio-asymmetric" ? (
        <div className="mt-[var(--section-gap)] grid auto-rows-[minmax(12rem,auto)] grid-cols-2 gap-3 md:auto-rows-[minmax(14rem,auto)] md:grid-cols-12 md:gap-5">
          {images.map((image, i) => {
            const tileClass = i === 0
              ? "col-span-2 row-span-2 md:col-span-7 md:row-span-2"
              : i === 1
                ? "col-span-1 row-span-2 md:col-span-5"
                : i % 3 === 2
                  ? "col-span-2 md:col-span-5"
                  : "col-span-1 md:col-span-7";
            return (
              <figure key={i} className={`group relative isolate min-w-0 overflow-hidden rounded-[var(--radius-lg)] ${tileClass}`}>
                {image.url ? (
                  <SiteImage src={image.url} alt={image.alt} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : <div className="absolute inset-0" style={{ background: "var(--color-soft-bg)" }} />}
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-12 pb-4 text-sm font-semibold text-white sm:px-6 sm:pb-6">
                  {image.caption || image.alt}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : variant === "portfolio-rows" ? (
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
            <figure key={i} className={`relative isolate min-w-0 overflow-hidden rounded-[var(--radius-lg)] ${i === 0 ? "min-h-52 sm:col-span-2 lg:row-span-2" : "aspect-[4/3]"}`}>
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
