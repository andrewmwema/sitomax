import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import { Section } from "./ui/section";
import { Eyebrow } from "./ui/eyebrow";
import { Heading } from "./ui/heading";
import { Card } from "./ui/card";

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
  variant: "centered" | "split";
};

const inputStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
  lineHeight: 1.6,
} as const;

export const ContactForm: ComponentConfig<ContactFormProps> = {
  label: "Contact form",
  fields: {
    design: designField(),
    eyebrow: { type: "text", label: "Eyebrow (small label)", contentEditable: true },
    heading: { type: "text", label: "Heading", contentEditable: true },
    formName: { type: "text", label: "Form name", placeholder: "contact" },
    submitText: { type: "text", label: "Submit button text", contentEditable: true },
    formFields: {
      type: "array",
      label: "Fields",
      getItemSummary: (item) => item.label || "Field",
      defaultItemProps: { label: "New field", fieldType: "text", required: false },
      arrayFields: {
        label: { type: "text", label: "Label" },
        fieldType: {
          type: "select",
          label: "Type",
          options: [
            { label: "Text", value: "text" },
            { label: "Email", value: "email" },
            { label: "Phone", value: "tel" },
            { label: "Multi-line text", value: "textarea" },
          ],
        },
        required: {
          type: "radio",
          label: "Required",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
        },
      },
    },
    variant: {
      type: "radio",
      label: "Layout",
      options: [
        { label: "Centered", value: "centered" },
        { label: "Split", value: "split" },
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
  },
  render: ({ eyebrow, heading, formName, submitText, formFields, variant }) => {
    const split = (variant ?? "centered") === "split";

    const form = (
      <Card className="gap-0 p-6 sm:p-8">
        {/* Submission handling is wired to /api/forms/submit. */}
        <form method="post" action="/api/forms/submit" className="flex flex-col gap-4">
          <input type="hidden" name="_form_name" value={formName} />
          {/* Honeypot field for spam bots: humans never see or fill it. */}
          <input
            type="text"
            name="_website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          {formFields.map((field, i) => {
            const id = `field-${i}`;
            return (
              <label key={i} htmlFor={id} className="flex flex-col gap-1.5 text-sm font-medium">
                {field.label}
                {field.fieldType === "textarea" ? (
                  <textarea
                    id={id}
                    name={field.label}
                    required={field.required}
                    rows={4}
                    className="w-full px-3.5 py-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={inputStyle}
                  />
                ) : (
                  <input
                    id={id}
                    name={field.label}
                    type={field.fieldType}
                    required={field.required}
                    className="min-h-12 w-full px-3.5 py-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={inputStyle}
                  />
                )}
              </label>
            );
          })}
          <button
            type="submit"
            className="min-h-12 px-5 py-3 text-sm font-semibold transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--color-on-primary)",
              borderRadius: "var(--radius-sm)",
              outlineColor: "var(--color-secondary)",
            }}
          >
            {submitText}
          </button>
        </form>
      </Card>
    );

    if (split) {
      return (
        <Section background="soft">
          <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-3">
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={2}>{heading}</Heading>
            </div>
            {form}
          </div>
        </Section>
      );
    }

    return (
      <Section background="soft">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Heading level={2}>{heading}</Heading>
          </div>
          {form}
        </div>
      </Section>
    );
  },
};
