import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, linkField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading, RichHeading } from "./ui/heading";
import { BlockIcon } from "./ui/icon";
import { RichTextContent } from "./ui/rich-text";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { IconTile } from "./ui/icon-tile";

export type FaqProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text?: RichText;
  items: { question: string; answer: RichText }[];
  openFirst?: boolean;
  contactHeading?: string;
  contactText?: RichText;
  contactButtonText?: string;
  contactButtonLink?: LinkValue;
  contactImage: string;
  contactImageAlt: string;
  variant: "accordion" | "two-column" | "sidebar";
};

export const Faq: ComponentConfig<FaqProps> = {
  label: "FAQ",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Introduction"),
    openFirst: {
      type: "radio",
      label: "First answer open initially",
      options: [{ label: "Yes", value: true }, { label: "No", value: false }],
    },
    items: {
      type: "array",
      label: "Questions",
      getItemSummary: (item) => item.question || "Question",
      defaultItemProps: { question: "New question?", answer: "<p>The answer.</p>" },
      arrayFields: {
        question: { type: "text", label: "Question", contentEditable: true },
        answer: richTextField("Answer"),
      },
    },
    contactHeading: { type: "text", label: "Contact sidebar heading", contentEditable: true },
    contactText: richTextField("Contact sidebar text"),
    contactButtonText: { type: "text", label: "Contact button text", contentEditable: true },
    contactButtonLink: linkField("Contact button link"),
    contactImage: imageField("Contact sidebar image"),
    contactImageAlt: { type: "text", label: "Contact image alt text" },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Accordion", value: "accordion" },
        { label: "Two columns", value: "two-column" },
        { label: "With contact sidebar", value: "sidebar" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "FAQ",
    heading: "Frequently asked questions",
    text: "",
    openFirst: false,
    contactHeading: "A question about your project?",
    contactText: "<p>Tell us what you have in mind. We can help you explore the next step.</p>",
    contactButtonText: "Talk to our team",
    contactButtonLink: "/contact",
    contactImage: "/samples/team-at-work.jpg",
    contactImageAlt: "Sample of a local team talking through a project",
    items: [
      { question: "How quickly can you start?", answer: "<p>Share your preferred dates and the work you have in mind so we can discuss availability.</p>" },
      {
        question: "How do I request a quote?",
        answer: "<p>Tell us about your project, your location and anything you would like us to consider.</p>",
      },
    ],
    variant: "accordion",
  },
  render: ({
    eyebrow, heading, text, items, variant = "accordion", openFirst = false,
    contactHeading, contactText, contactButtonText, contactButtonLink, contactImage, contactImageAlt,
  }) => {
    const intro = (
      <div className={`section-intro flex flex-col gap-4 ${variant === "sidebar" ? "max-w-[43rem]" : "mx-auto max-w-[43rem] items-center text-center"}`}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <RichHeading level={2}>{heading}</RichHeading>
        <RichTextContent value={text} className="w-full text-base" />
      </div>
    );
    if (variant === "two-column") {
      return (
        <Section>
          <div className="flex flex-col gap-12">
            {intro}
            <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
              {items.map((item, i) => (
                <div key={i} className="flex min-w-0 flex-col gap-3 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
                  <Heading level={3}>
                    {item.question}
                  </Heading>
                  <RichTextContent value={item.answer} className="w-full max-w-[65ch] text-sm" />
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    const accordion = (
      <div className="flex min-w-0 flex-col gap-3">
        {items.map((item, i) => (
          <details
            key={i}
            open={i === 0 && openFirst}
            className="group px-5 py-4"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <summary
              className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden"
              style={{ fontFamily: "var(--font-body)", outlineColor: "var(--color-primary)" }}
            >
              {item.question}
              <span className="shrink-0 transition-transform group-open:rotate-45" style={{ color: "var(--color-primary)" }}>
                <BlockIcon name="plus" size={18} />
              </span>
            </summary>
            <RichTextContent value={item.answer} className="mt-[var(--detail-gap)] w-full max-w-[65ch] text-sm" />
          </details>
        ))}
      </div>
    );

    if (variant === "sidebar") {
      return (
        <Section background="soft">
          {intro}
          <div className="mt-[var(--section-gap)] grid items-start gap-[var(--section-gap)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {accordion}
            <Card className="min-w-0" style={{ padding: 0, overflow: "hidden", gap: 0 }}>
              {contactImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={contactImage} alt={contactImageAlt} loading="lazy" className="aspect-[16/9] w-full object-cover" />
              ) : null}
              <div className="flex flex-col gap-4 p-6 sm:p-7">
                <IconTile name="heart-handshake" />
                <Heading level={3}>{contactHeading}</Heading>
                <RichTextContent value={contactText} className="w-full text-sm" />
                {contactButtonText ? <Button href={contactButtonLink} className="w-full">{contactButtonText}</Button> : null}
              </div>
            </Card>
          </div>
        </Section>
      );
    }

    return (
      <Section>
        <div className="mx-auto flex max-w-[46rem] flex-col gap-10">
          {intro}
          {accordion}
        </div>
      </Section>
    );
  },
};
