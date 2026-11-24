import type { CSSProperties } from "react";
import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, linkField, iconField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { IconValue } from "@/lib/icons";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { Button } from "./ui/button";
import { IconTile } from "./ui/icon-tile";
import { RichTextContent } from "./ui/rich-text";

export type TextSectionVariant =
  | "standard"
  | "centered"
  | "intro"
  | "two-column"
  | "mission"
  | "columns"
  | "callout"
  | "pull-quote"
  | "article"
  | "framed"
  | "editorial"
  | "accent"
  | "cta";

export type TextSectionProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  variant: TextSectionVariant;
  /** Small attribution line under the "mission" statement. */
  attribution: string;
  /** Highlighted side box shown by the "callout" variant. */
  calloutIcon: IconValue;
  calloutTitle: string;
  calloutText: RichText;
  /** Large quote breaking the text in the "pull-quote" variant. */
  pullQuote: string;
  /** Buttons and alignment for the "cta" variant. */
  buttonText: string;
  buttonLink: LinkValue;
  secondaryButtonText: string;
  secondaryButtonLink: LinkValue;
  ctaAlign: "left" | "center";
  /** @deprecated legacy prop, replaced by variant. */
  align?: "left" | "center";
};

const headingFont: CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
};

/** Eyebrow + heading block reused by most layouts. */
function SectionHeader({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  if (!eyebrow && !heading) return null;
  return (
    <>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {heading ? <RichHeading level={2}>{heading}</RichHeading> : null}
    </>
  );
}

export const TextSection: ComponentConfig<TextSectionProps> = {
  label: "Text section",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Text"),
    variant: {
      type: "select",
      label: "Layout",
      options: [
        { label: "Standard", value: "standard" },
        { label: "Centered", value: "centered" },
        { label: "Centered intro", value: "intro" },
        { label: "Side heading + body", value: "two-column" },
        { label: "Mission statement", value: "mission" },
        { label: "Two-column article", value: "columns" },
        { label: "With callout box", value: "callout" },
        { label: "With pull quote", value: "pull-quote" },
        { label: "Long-form article", value: "article" },
        { label: "Framed introduction", value: "framed" },
        { label: "Editorial split", value: "editorial" },
        { label: "Accent statement", value: "accent" },
        { label: "Heading, text + button", value: "cta" },
      ],
    },
    attribution: { type: "text", label: "Attribution", contentEditable: true },
    calloutIcon: iconField("Callout icon"),
    calloutTitle: { type: "text", label: "Callout title", contentEditable: true },
    calloutText: richTextField("Callout text"),
    pullQuote: { type: "textarea", label: "Pull quote", contentEditable: true },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: linkField("Button link"),
    secondaryButtonText: {
      type: "text",
      label: "Second button text",
      contentEditable: true,
    },
    secondaryButtonLink: linkField("Second button link"),
    ctaAlign: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Centered", value: "center" },
      ],
    },
  },
  // Only show the fields the chosen layout actually uses.
  resolveFields: (data, { fields }) => {
    const variant =
      data.props.variant ?? (data.props.align === "center" ? "centered" : "standard");
    const {
      heading,
      attribution,
      calloutIcon,
      calloutTitle,
      calloutText,
      pullQuote,
      buttonText,
      buttonLink,
      secondaryButtonText,
      secondaryButtonLink,
      ctaAlign,
      ...rest
    } = fields;
    return {
      ...rest,
      ...(variant === "mission" ? { attribution } : { heading }),
      ...(variant === "callout" ? { calloutIcon, calloutTitle, calloutText } : null),
      ...(variant === "pull-quote" ? { pullQuote } : null),
      ...(variant === "cta"
        ? { buttonText, buttonLink, secondaryButtonText, secondaryButtonLink, ctaAlign }
        : null),
      // Hidden fields stay typed as present; Puck only renders the
      // returned subset, so narrowing back to the full shape is safe.
    } as typeof fields;
  },
  defaultProps: {
    design: {},
    eyebrow: "About us",
    heading: "A team you can rely on",
    text: "<p>Tell your visitors who you are, what you do and why they should choose you.</p>",
    variant: "standard",
    attribution: "",
    calloutIcon: "shield-check",
    calloutTitle: "",
    calloutText: "",
    pullQuote: "",
    buttonText: "",
    buttonLink: "/contact",
    secondaryButtonText: "",
    secondaryButtonLink: "",
    ctaAlign: "left",
  },
  render: ({
    eyebrow,
    heading,
    text,
    variant,
    attribution,
    calloutIcon,
    calloutTitle,
    calloutText,
    pullQuote,
    buttonText,
    buttonLink,
    secondaryButtonText,
    secondaryButtonLink,
    ctaAlign,
    align,
    puck,
  }) => {
    const layout: TextSectionVariant =
      variant ?? (align === "center" ? "centered" : "standard");

    if (layout === "framed") {
      return (
        <Section background="soft">
          <div className="mx-auto max-w-[52rem] border p-7 sm:p-12 lg:p-16"
            style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-bg)" }}>
            <div className="section-intro flex flex-col gap-5">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
              <RichTextContent value={text} className="w-full" />
            </div>
          </div>
        </Section>
      );
    }

    if (layout === "editorial") {
      return (
        <Section>
          <div className="grid gap-8 border-t pt-8 md:grid-cols-[1fr_1.25fr] md:gap-16"
            style={{ borderColor: "var(--color-border)" }}>
            <div className="section-intro flex flex-col gap-4"><SectionHeader eyebrow={eyebrow} heading={heading} /></div>
            <RichTextContent value={text} className="section-intro w-full !max-w-none" />
          </div>
        </Section>
      );
    }

    if (layout === "accent") {
      return (
        <Section background="soft">
          <div className="mx-auto max-w-[55rem] border-l-4 pl-6 sm:pl-10"
            style={{ borderColor: "var(--color-primary)" }}>
            <div className="section-intro flex flex-col gap-5">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
              <RichTextContent value={text} className="w-full" />
            </div>
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- Centered intro */
    if (layout === "intro") {
      return (
        <Section>
          <div className="section-intro mx-auto flex max-w-[680px] flex-col items-center gap-4 text-center">
            <SectionHeader eyebrow={eyebrow} heading={heading} />
            {/* Lead paragraph: larger, relaxed line height. */}
            <RichTextContent
              value={text}
              className="w-full"
              style={{
                fontSize: "clamp(1.125rem, 1.05rem + 0.45vw, 1.3rem)",
                lineHeight: 1.65,
              }}
            />
          </div>
        </Section>
      );
    }

    /* ---------------------------------------- Side heading + body */
    if (layout === "two-column") {
      return (
        <Section>
          <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
            <div className="section-intro flex flex-col gap-4">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
            </div>
            <RichTextContent value={text} className="section-intro w-full max-w-[65ch]" />
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- Mission statement */
    if (layout === "mission") {
      return (
        <Section>
          <div className="section-intro mx-auto flex max-w-[56rem] flex-col items-center gap-6 text-center">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <RichTextContent
              value={text}
              className="w-full !max-w-none"
              style={{
                ...headingFont,
                fontSize: "clamp(1.5rem, 1.05rem + 2.2vw, 2.5rem)",
                lineHeight: 1.3,
                letterSpacing: "-0.5px",
                // Statement reads in full text color, not muted.
                "--color-muted": "var(--color-text)",
              } as CSSProperties}
            />
            {attribution ? (
              <p
                className="text-sm font-semibold uppercase"
                style={{ color: "var(--color-secondary)", letterSpacing: "0.12em" }}
              >
                {attribution}
              </p>
            ) : null}
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- Two-column article */
    if (layout === "columns") {
      return (
        <Section>
          <div className="flex flex-col gap-8">
            <div className="section-intro flex max-w-[46rem] flex-col gap-4">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
            </div>
            <RichTextContent
              value={text}
              className="section-intro w-full !max-w-none md:columns-2 md:gap-14"
            />
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- With callout box */
    if (layout === "callout") {
      return (
        <Section>
          <div className="grid items-start gap-10 md:grid-cols-[1.5fr_1fr] md:gap-14">
            <div className="section-intro flex flex-col gap-4">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
              <RichTextContent value={text} className="w-full max-w-[65ch]" />
            </div>
            <aside
              className="flex flex-col gap-3 p-6 sm:p-7"
              style={{
                backgroundColor: "var(--color-soft-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <IconTile name={calloutIcon || "shield-check"} editPath={puck.isEditing ? "calloutIcon" : undefined} />
              {calloutTitle ? (
                <p className="text-lg" style={headingFont}>
                  {calloutTitle}
                </p>
              ) : null}
              <RichTextContent value={calloutText} className="w-full text-sm" />
            </aside>
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- With pull quote */
    if (layout === "pull-quote") {
      return (
        <Section>
          <div className="section-intro mx-auto max-w-[48rem]">
            <div className="mb-[var(--content-gap)] flex flex-col gap-4">
              <SectionHeader eyebrow={eyebrow} heading={heading} />
            </div>
            {pullQuote ? (
              <blockquote
                className="mb-[var(--content-gap)] md:float-right md:mb-[var(--content-gap)] md:ml-[var(--section-gap)] md:w-[42%]"
                style={{
                  borderTop: "3px solid var(--color-secondary)",
                  paddingTop: "1.1rem",
                }}
              >
                <p
                  style={{
                    ...headingFont,
                    fontSize: "clamp(1.25rem, 1.1rem + 0.8vw, 1.6rem)",
                    lineHeight: 1.35,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {pullQuote}
                </p>
              </blockquote>
            ) : null}
            <RichTextContent value={text} className="w-full !max-w-none" />
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- Long-form article */
    if (layout === "article") {
      return (
        <Section>
          <div className="section-intro mx-auto flex max-w-[65ch] flex-col gap-5">
            <SectionHeader eyebrow={eyebrow} heading={heading} />
            <RichTextContent value={text} className="w-full rich-text-drop-cap" />
          </div>
        </Section>
      );
    }

    /* --------------------------------------------- Heading, text + button */
    if (layout === "cta") {
      const centered = ctaAlign === "center";
      return (
        <Section>
          <div
            className={`section-intro flex max-w-[46rem] flex-col gap-5 ${
              centered ? "mx-auto items-center text-center" : "items-start"
            }`}
          >
            <SectionHeader eyebrow={eyebrow} heading={heading} />
            <RichTextContent value={text} className="w-full" />
            {buttonText || secondaryButtonText ? (
              <div
                className={`flex w-full flex-col gap-3 pt-1 min-[480px]:w-auto min-[480px]:flex-row min-[480px]:flex-wrap ${
                  centered ? "min-[480px]:justify-center" : ""
                }`}
              >
                {buttonText ? <Button href={buttonLink}>{buttonText}</Button> : null}
                {secondaryButtonText ? (
                  <Button href={secondaryButtonLink} variant="secondary">
                    {secondaryButtonText}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>
      );
    }

    /* ------------------------------------- Standard / Centered */
    return (
      <Section>
        <div
          className={`section-intro flex max-w-[46rem] flex-col gap-4 ${
            layout === "centered" ? "mx-auto items-center text-center" : ""
          }`}
        >
          <SectionHeader eyebrow={eyebrow} heading={heading} />
          <RichTextContent value={text} className="w-full max-w-[65ch]" />
        </div>
      </Section>
    );
  },
};
