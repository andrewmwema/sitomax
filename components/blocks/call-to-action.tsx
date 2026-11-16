import type { ComponentConfig } from "@puckeditor/core";
import { designField, imageField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { EnquiryForm, enquiryFields, enquiryFieldsField, type EnquiryField } from "./ui/enquiry-form";

export type CallToActionProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  text: string;
  buttonText: string;
  buttonLink: string;
  variant: "dark" | "primary" | "split" | "image" | "form";
  image: string;
  imageAlt?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: string;
  formName?: string;
  formFields?: EnquiryField[];
  formNote?: string;
};

export const CallToAction: ComponentConfig<CallToActionProps> = {
  label: "Call to action",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    text: { type: "textarea", label: "Text", contentEditable: true },
    buttonText: { type: "text", label: "Button text", contentEditable: true },
    buttonLink: { type: "text", label: "Button link" },
    secondaryButtonText: { type: "text", label: "Secondary button text" },
    secondaryButtonLink: { type: "text", label: "Secondary button link" },
    image: imageField("Background photo"),
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
  defaultProps: {
    design: {},
    eyebrow: "Get started",
    heading: "Ready to get started?",
    text: "Contact us today for a free, no-obligation quote.",
    buttonText: "Contact us",
    buttonLink: "/contact",
    variant: "dark",
    image: "/samples/home-interior.jpg",
    imageAlt: "Sample of a welcoming living space",
    secondaryButtonText: "",
    secondaryButtonLink: "#services",
    formName: "project-enquiry",
    formFields: enquiryFields,
    formNote: "Required fields are marked with an asterisk.",
  },
  render: ({ eyebrow, heading, text, buttonText, buttonLink, variant, image, imageAlt, secondaryButtonText, secondaryButtonLink, formName, formFields, formNote }) => {
    const layout = variant ?? "dark";

    if (layout === "form") {
      return (
        <Section background="soft">
          <div className="grid items-center gap-10 md:grid-cols-2 lg:gap-20">
            <div className="flex flex-col gap-5">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
              <p className="max-w-[48ch] text-lg" style={{ color: "var(--color-muted)" }}>{text}</p>
              <div className="mt-4 border-t pt-6 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>A little detail now helps us make our first conversation more useful.</div>
            </div>
            <Card className="p-6 sm:p-8">
              <EnquiryForm formName={formName || "project-enquiry"} submitText={buttonText} fields={formFields ?? enquiryFields} note={formNote} />
            </Card>
          </div>
        </Section>
      );
    }

    if (layout === "split") {
      return (
        <Section background="soft">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="flex max-w-2xl flex-col gap-4">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
              <p className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
                {text}
              </p>
            </div>
            {buttonText ? (
              <Button href={buttonLink} className="shrink-0">
                {buttonText}
              </Button>
            ) : null}
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
        <div className={`mx-auto flex flex-col gap-6 ${layout === "image" ? "min-h-80 max-w-3xl items-start justify-center" : layout === "primary" ? "max-w-4xl items-center text-center" : "max-w-3xl items-center text-center"}`}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={2}>{heading}</Heading>
          <p className="max-w-[55ch] text-lg" style={{ color: "var(--color-muted)", lineHeight: 1.6 }}>
            {text}
          </p>
          <div className="flex w-full flex-col gap-3 min-[480px]:w-auto min-[480px]:flex-row">
          {buttonText ? (
            <Button href={buttonLink}>
              {buttonText}
            </Button>
          ) : null}
          {secondaryButtonText ? <Button href={secondaryButtonLink} variant="secondary">{secondaryButtonText}</Button> : null}
          </div>
        </div>
      </Section>
    );
  },
};
