import type { ComponentConfig } from "@puckeditor/core";

export type ContactFormProps = {
  heading: string;
  formName: string;
  submitText: string;
  formFields: {
    label: string;
    fieldType: "text" | "email" | "tel" | "textarea";
    required: boolean;
  }[];
};

export const ContactForm: ComponentConfig<ContactFormProps> = {
  label: "Contact form",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    formName: { type: "text", label: "Form name", placeholder: "contact" },
    submitText: { type: "text", label: "Submit button text" },
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
  },
  defaultProps: {
    heading: "Contact us",
    formName: "contact",
    submitText: "Send message",
    formFields: [
      { label: "Name", fieldType: "text", required: true },
      { label: "Email", fieldType: "email", required: true },
      { label: "Message", fieldType: "textarea", required: true },
    ],
  },
  render: ({ heading, formName, submitText, formFields }) => {
    const inputClasses =
      "w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-2";

    return (
      <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12 sm:px-6 md:py-16">
          <h2
            className="text-center text-3xl font-bold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h2>
          {/* Submission handling is wired to /api/forms/submit. */}
          <form
            method="post"
            action="/api/forms/submit"
            className="flex flex-col gap-4"
          >
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
                <label
                  key={i}
                  htmlFor={id}
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  {field.label}
                  {field.required ? (
                    <span className="sr-only">(required)</span>
                  ) : null}
                  {field.fieldType === "textarea" ? (
                    <textarea
                      id={id}
                      name={field.label}
                      required={field.required}
                      rows={4}
                      className={inputClasses}
                      style={{
                        borderColor: "color-mix(in srgb, var(--color-text) 20%, transparent)",
                        color: "var(--color-text)",
                      }}
                    />
                  ) : (
                    <input
                      id={id}
                      name={field.label}
                      type={field.fieldType}
                      required={field.required}
                      className={inputClasses}
                      style={{
                        borderColor: "color-mix(in srgb, var(--color-text) 20%, transparent)",
                        color: "var(--color-text)",
                      }}
                    />
                  )}
                </label>
              );
            })}
            <button
              type="submit"
              className="rounded-lg px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {submitText}
            </button>
          </form>
        </div>
      </section>
    );
  },
};
