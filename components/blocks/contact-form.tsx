import type { ComponentConfig } from "@puckeditor/core";
import { designField, iconField, imageField, richTextField } from "@/lib/puck/fields";
import type { RichText } from "@puckeditor/core";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";
import { EnquiryForm, enquiryFieldsField } from "./ui/enquiry-form";
import { RichTextContent } from "./ui/rich-text";
import { BlockIcon } from "./ui/icon";
import { businessContactDetails, type SiteMenu } from "@/lib/page-navigation";
import type { IconValue } from "@/lib/icons";

export type ContactFormProps = {
  design?: BlockDesign;
  eyebrow: string;
  heading: string;
  formName: string;
  submitText: string;
  formFields: {
    label: string;
    fieldType: "text" | "email" | "tel" | "textarea";
    required: boolean;
  }[];
  variant: "centered" | "split" | "visit";
  text?: RichText;
  details?: { icon: IconValue; label: string; value: string }[];
  image: string;
  imageAlt?: string;
  note?: string;
};

export const ContactForm: ComponentConfig<ContactFormProps> = {
  label: "Contact form",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    formName: { type: "text", label: "Form name", placeholder: "contact" },
    submitText: { type: "text", label: "Submit button text", contentEditable: true },
    text: richTextField("Introduction"),
    image: imageField("Location photo"),
    imageAlt: { type: "text", label: "Photo alt text" },
    note: { type: "textarea", label: "Form note" },
    details: {
      type: "array", label: "Contact details", getItemSummary: (item) => item.label,
      defaultItemProps: { icon: "map-pin", label: "Visit", value: "[Street address, town]" },
      arrayFields: { icon: iconField("Icon"), label: { type: "text", label: "Label" }, value: { type: "text", label: "Details" } },
    },
    formFields: enquiryFieldsField,
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Centered", value: "centered" },
        { label: "Split", value: "split" },
        { label: "Visit & enquire", value: "visit" },
      ],
    },
  },
  defaultProps: {
    design: {},
    eyebrow: "Contact",
    heading: "Send us a message",
    formName: "contact",
    submitText: "Send message",
    formFields: [
      { label: "Name", fieldType: "text", required: true },
      { label: "Email", fieldType: "email", required: true },
      { label: "Message", fieldType: "textarea", required: true },
    ],
    variant: "centered",
    image: "/samples/home-exterior.jpg",
    imageAlt: "Sample exterior for a business location",
    text: "",
    details: [],
    note: "",
  },
  render: ({ eyebrow, heading, formName, submitText, formFields, variant, text, details, image, imageAlt, note, puck }) => {
    const split = variant === "split" || variant === "visit";
    const menu = puck.metadata?.siteMenu as SiteMenu | undefined;
    const info = menu ? businessContactDetails(menu.contacts) : (details ?? []).map((detail) => ({ ...detail, href: "" }));
    const contactDetails = info.length ? <dl className="mt-[var(--content-gap)] grid gap-5 border-t pt-6 sm:grid-cols-2" style={{ borderColor: "var(--color-border)" }}>
      {info.map((detail, i) => <div key={i} className="flex flex-col gap-2">
        <dt className="flex items-center gap-2 text-sm font-semibold"><BlockIcon name={detail.icon} size={18}
          editPath={puck.isEditing && !menu ? `details.${i}.icon` : undefined} />{detail.label}</dt>
        <dd className="whitespace-pre-line text-sm" style={{ color: "var(--color-muted)" }}>
          {detail.href ? <a href={detail.href} className="underline">{detail.value}</a> : detail.value}
        </dd>
      </div>)}
    </dl> : null;

    const form = (
      <Card className="gap-0 p-6 sm:p-8">
        <EnquiryForm formName={formName} submitText={submitText} fields={formFields} note={note} />
      </Card>
    );

    if (split) {
      return (
        <Section background={variant === "visit" ? "default" : "soft"}>
          <div id="contact" className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-3">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
              {text ? <RichTextContent value={text} className="max-w-[50ch]" /> : null}
              {variant === "visit" && image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={image} alt={imageAlt || ""} loading="lazy" className="mt-[var(--content-gap)] aspect-[16/9] w-full object-cover" style={{ borderRadius: "var(--radius-lg)" }} />
              ) : null}
              {contactDetails}
            </div>
            {contactDetails}
            {form}
          </div>
        </Section>
      );
    }

    return (
      <Section background="soft">
        <div id="contact" className="mx-auto flex w-full max-w-xl flex-col gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Heading level={2}>{heading}</Heading>
            {text ? <RichTextContent value={text} className="max-w-[50ch]" /> : null}
          </div>
          {form}
        </div>
      </Section>
    );
  },
};
