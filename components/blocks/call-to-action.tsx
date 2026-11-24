import type { ComponentConfig, RichText } from "@puckeditor/core";
import { designField, linkField, imageField, richTextField, richHeadingField } from "@/lib/puck/fields";
import type { LinkValue } from "@/lib/links";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { RichHeading } from "./ui/heading";
import { Card } from "./ui/card";
import { RichTextContent } from "./ui/rich-text";
import { EnquiryForm, enquiryFields, enquiryFieldsField, type EnquiryField } from "./ui/enquiry-form";
import { ConversionActions } from "./ui/conversion-actions";

export type CallToActionProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: RichText;
  buttonText: string;
  buttonLink: LinkValue;
  buttonAction?: "link" | "form-popup";
  buttonFormName?: string;
  variant: "dark" | "primary" | "split" | "image" | "form";
  image: string;
  imageAlt?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: LinkValue;
  secondaryButtonAction?: "link" | "form-popup";
  secondaryButtonFormName?: string;
  trustLine?: string;
  formName?: string;
  formFields?: EnquiryField[];
  formNote?: string;
};

export const CallToAction: ComponentConfig<CallToActionProps> = {
  label: "Call to action",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: richHeadingField("Heading", 2),
    text: richTextField("Text"),
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonAction: {
      type: "select",
      label: "Primary action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    buttonLink: linkField("Button link"),
    buttonFormName: { type: "text", label: "Popup form name" },
    secondaryButtonText: { type: "text", label: "Secondary button text" },
    secondaryButtonAction: {
      type: "select",
      label: "Secondary action",
      options: [{ label: "Link or scroll", value: "link" }, { label: "Form popup", value: "form-popup" }],
    },
    secondaryButtonLink: linkField("Secondary button link"),
    secondaryButtonFormName: { type: "text", label: "Secondary popup form name" },
    trustLine: { type: "text", label: "Trust line under buttons", contentEditable: true },
    image: imageField("Background photo", "16/9"),
    imageAlt: { type: "text", label: "Photo alt text" },
    formName: { type: "text", label: "Form name" },
    formFields: enquiryFieldsField,
    formNote: { type: "textarea", label: "Form note" },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Dark band", value: "dark" },
        { label: "Primary band", value: "primary" },
        { label: "Split", value: "split" },
        { label: "Photo background", value: "image" },
        { label: "Split with form", value: "form" },
      ],
    },
  },
  resolveFields: (data, { fields }) => {
    const { buttonLink, buttonFormName, secondaryButtonLink, secondaryButtonFormName, ...rest } = fields;
    return {
      ...rest,
      ...(data.props.buttonAction === "form-popup" ? { buttonFormName } : { buttonLink }),
      ...(data.props.secondaryButtonAction === "form-popup" ? { secondaryButtonFormName } : { secondaryButtonLink }),
    } as typeof fields;
  },
  defaultProps: {
    design: {},
    eyebrow: "Get started",
    heading: "Ready to get started?",
    text: "Contact us today for a free, no-obligation quote.",
    buttonText: "Contact us",
    buttonAction: "link",
    buttonLink: "/contact",
    variant: "dark",
    image: "/samples/home-interior.jpg",
    imageAlt: "Sample of a welcoming living space",
    secondaryButtonText: "",
    secondaryButtonLink: "#services",
    secondaryButtonAction: "link",
    buttonFormName: "cta-enquiry",
    secondaryButtonFormName: "cta-enquiry",
    trustLine: "",
    formName: "project-enquiry",
    formFields: enquiryFields,
    formNote: "Required fields are marked with an asterisk.",
  },
  render: ({
    eyebrow, heading, text, buttonText, buttonLink, buttonAction, buttonFormName,
    variant, image, imageAlt, secondaryButtonText, secondaryButtonLink,
    secondaryButtonAction, secondaryButtonFormName, trustLine,
    formName, formFields, formNote,
  }) => {
    const layout = variant ?? "dark";

    if (layout === "form") {
      return (
        <Section background="soft">
          <div className="grid items-center gap-10 md:grid-cols-2 lg:gap-20">
            <div className="section-intro flex flex-col gap-5">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <RichHeading level={2}>{heading}</RichHeading>
              <RichTextContent value={text} className="max-w-[48ch] text-lg" style={{ color: "var(--color-muted)" }} />
              <div className="mt-[var(--content-gap)] border-t pt-6 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>A little detail now helps us make our first conversation more useful.</div>
            </div>
            <Card className="p-6 sm:p-8">
              <EnquiryForm formName={formName || "project-enquiry"} submitText={buttonText} fields={formFields ?? enquiryFields} note={formNote} />
              {trustLine ? <p className="mt-4 text-sm leading-6" style={{ color: "var(--color-muted)" }}>{trustLine}</p> : null}
            </Card>
          </div>
        </Section>
      );
    }

    if (layout === "split") {
      return (
        <Section background="soft">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="section-intro flex max-w-2xl flex-col gap-4">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <RichHeading level={2}>{heading}</RichHeading>
              <RichTextContent value={text} className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }} />
            </div>
            <ConversionActions
              primary={buttonText ? { label: buttonText, mode: buttonAction, link: buttonLink, formName: buttonFormName } : undefined}
              secondary={secondaryButtonText ? { label: secondaryButtonText, mode: secondaryButtonAction, link: secondaryButtonLink, formName: secondaryButtonFormName } : undefined}
              trustLine={trustLine}
              fields={formFields}
              className="shrink-0"
            />
          </div>
        </Section>
      );
    }

    return (
      <Section background={layout === "primary" ? "primary" : "dark"} className="relative isolate overflow-hidden">
        {layout === "image" && image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={imageAlt || ""} loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10" style={{ backgroundColor: "rgba(0,0,0,0.58)" }} />
          </>
        ) : null}
        <div className={`section-intro mx-auto flex flex-col gap-6 ${layout === "image" ? "min-h-80 max-w-3xl items-start justify-center" : layout === "primary" ? "max-w-4xl items-center text-center" : "max-w-3xl items-center text-center"}`}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <RichHeading level={2}>{heading}</RichHeading>
          <RichTextContent value={text} className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }} />
          <ConversionActions
            primary={buttonText ? { label: buttonText, mode: buttonAction, link: buttonLink, formName: buttonFormName } : undefined}
            secondary={secondaryButtonText ? { label: secondaryButtonText, mode: secondaryButtonAction, link: secondaryButtonLink, formName: secondaryButtonFormName } : undefined}
            trustLine={trustLine}
            fields={formFields}
            center={layout !== "image"}
          />
        </div>
      </Section>
    );
  },
};
