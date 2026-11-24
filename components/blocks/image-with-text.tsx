import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, imageField, linkField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Container } from "./ui/container";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { RichTextContent } from "./ui/rich-text";
import { Button } from "./ui/button";
import type { LinkValue } from "@/lib/links";

export type ImageWithTextProps = {
  design?: BlockDesign;
  image: string;
  imageAlt: string;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: "image-left" | "image-right" | "stacked" | "report-preview" | "image-framed" | "story-banner";
  reportLabel?: string;
  reportTitle?: string;
  reportReference?: string;
  reportHighlights?: { label: string; value: string }[];
  buttonText?: string;
  buttonLink?: LinkValue;
  /** @deprecated legacy prop, replaced by variant. */
  imageSide?: "left" | "right";
};

export const ImageWithText: ComponentConfig<ImageWithTextProps> = {
  label: "Image with text",
  fields: {
    design: designField(),
    image: imageField("Image"),
    imageAlt: { type: "text", label: "Image alt text" },
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Text"),
    reportLabel: { type: "text", label: "Document type", contentEditable: true },
    reportTitle: { type: "text", label: "Document title", contentEditable: true },
    reportReference: { type: "text", label: "Document reference", contentEditable: true },
    reportHighlights: {
      type: "array",
      label: "Document highlights",
      getItemSummary: (item) => item.label || "Highlight",
      defaultItemProps: { label: "Project total", value: "[Estimate]" },
      arrayFields: {
        label: { type: "text", label: "Label", contentEditable: true },
        value: { type: "text", label: "Value", contentEditable: true },
      },
    },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: linkField("Button link"),
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Image left", value: "image-left" },
        { label: "Image right", value: "image-right" },
        { label: "Stacked", value: "stacked" },
        { label: "Report / document preview", value: "report-preview" },
        { label: "Framed story", value: "image-framed" },
        { label: "Story banner", value: "story-banner" },
      ],
    },
  },
  defaultProps: {
    design: {},
    image: "",
    imageAlt: "",
    eyebrow: "Why choose us",
    heading: "Experience that shows",
    text: "<p>Share what makes your business different.</p>",
    variant: "image-left",
    reportLabel: "Sample document",
    reportTitle: "A clear plan for what comes next",
    reportReference: "A thoughtful starting point",
    reportHighlights: [
      { label: "Project scope", value: "A clear outline of the work" },
      { label: "Next steps", value: "What happens after we speak" },
      { label: "Project details", value: "The information that guides an estimate" },
    ],
    buttonText: "",
    buttonLink: "/contact",
  },
  render: ({ image, imageAlt, eyebrow, heading, text, variant, imageSide, reportLabel, reportTitle, reportReference, reportHighlights = [], buttonText, buttonLink }) => {
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

    if (layout === "image-framed" || layout === "story-banner") {
      return (
        <Section background={layout === "story-banner" ? "dark" : "soft"}>
          <div className={`grid items-center gap-8 overflow-hidden rounded-[var(--radius-lg)] lg:grid-cols-2 ${layout === "image-framed" ? "site-card border p-5 sm:p-8" : ""}`}
            style={layout === "image-framed" ? { background: "var(--color-bg)", borderColor: "var(--color-border)" } : undefined}>
            <div className="section-intro flex flex-col items-start gap-4">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <RichHeading level={2}>{heading}</RichHeading>
              <RichTextContent value={text} className="w-full max-w-[60ch]" />
              {buttonText ? <Button href={buttonLink}>{buttonText}</Button> : null}
            </div>
            {imageElement}
          </div>
        </Section>
      );
    }

    if (layout === "report-preview") {
      return (
        <Section background="soft">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="section-intro flex flex-col items-start gap-5">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <RichHeading level={2}>{heading}</RichHeading>
              <RichTextContent value={text} className="w-full max-w-[60ch]" />
              {buttonText ? <Button href={buttonLink}>{buttonText}</Button> : null}
            </div>
            <article className="relative mx-auto w-full max-w-lg rotate-[1deg] rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-medium)] sm:p-8"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
              <header className="flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-secondary)" }}>{reportLabel}</p>
                  <h3 className="text-xl font-semibold tracking-tight sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>{reportTitle}</h3>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>{reportReference}</p>
                </div>
                <span className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "color-mix(in srgb, var(--color-primary) 10%, var(--color-bg))", color: "var(--color-primary)" }}>Prepared</span>
              </header>
              {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={image} alt={imageAlt} loading="lazy" className="mt-5 aspect-[16/7] w-full rounded-[var(--radius-sm)] object-cover" />
              ) : (
                <div className="mt-5 flex aspect-[16/7] items-end gap-2 overflow-hidden rounded-[var(--radius-sm)] p-4"
                  style={{ background: "color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))" }} aria-hidden="true">
                  {[34, 57, 48, 76, 62, 92].map((height, i) => <span key={i} className="flex-1 rounded-t" style={{ height: `${height}%`, background: i === 5 ? "var(--color-secondary)" : "var(--color-primary)" }} />)}
                </div>
              )}
              <dl className="mt-5 grid gap-3">
                {reportHighlights.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0"
                    style={{ borderColor: "var(--color-border)" }}>
                    <dt className="text-sm" style={{ color: "var(--color-muted)" }}>{item.label}</dt>
                    <dd className="text-right text-sm font-semibold">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </Section>
      );
    }

    if (layout === "stacked") {
      return (
        <Section container={false}>
          <Container className="flex flex-col gap-10">
            <div className="section-intro mx-auto flex max-w-[46rem] flex-col items-center gap-4 text-center">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <RichHeading level={2}>{heading}</RichHeading>
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
          <div className="section-intro flex flex-col gap-4">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <RichHeading level={2}>{heading}</RichHeading>
            <RichTextContent value={text} className="w-full max-w-[65ch]" />
          </div>
        </Container>
      </Section>
    );
  },
};
