import type { ArrayField } from "@puckeditor/core";
import { FormSubmission } from "./form-submission";

export type EnquiryField = {
  label: string;
  fieldType: "text" | "email" | "tel" | "textarea" | "select" | "checkboxes";
  required: boolean;
  options?: string[];
};

export const enquiryFields: EnquiryField[] = [
  { label: "Name", fieldType: "text", required: true },
  { label: "Email", fieldType: "email", required: true },
  { label: "Tell us a little about your project", fieldType: "textarea", required: true },
];

export const enquiryFieldsField: ArrayField<EnquiryField[]> = {
  type: "array",
  label: "Form fields",
  getItemSummary: (item) => item.label || "Field",
  defaultItemProps: { label: "New field", fieldType: "text", required: false },
  arrayFields: {
    label: { type: "text", label: "Label" },
    fieldType: {
      type: "select", label: "Type",
      options: [
        { label: "Text", value: "text" }, { label: "Email", value: "email" },
        { label: "Phone", value: "tel" }, { label: "Multi-line text", value: "textarea" },
        { label: "Dropdown", value: "select" }, { label: "Checkboxes", value: "checkboxes" },
      ],
    },
    required: { type: "radio", label: "Required", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    options: { type: "textarea", label: "Choices (one per line)" },
  },
};

const inputStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
};

export function EnquiryForm({ formName, submitText, fields, note }: {
  formName: string;
  submitText: string;
  fields: EnquiryField[];
  note?: string;
}) {
  return (
    <FormSubmission className="flex flex-col gap-5">
      <input type="hidden" name="_form_name" value={formName} />
      <input type="text" name="_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {fields.map((field, i) => (
        field.fieldType === "checkboxes" ? (
          <fieldset key={i} className="flex flex-col gap-3 text-sm">
            <legend className="font-medium">{field.label}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(field.options ?? []).filter(Boolean).map((option) => (
                <label key={option} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name={field.label} value={option} className="size-4 accent-[var(--color-primary)]" />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <label key={i} className="flex flex-col gap-2 text-sm font-medium">
            <span>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</span>
            {field.fieldType === "textarea" ? (
              <textarea name={field.label} required={field.required} rows={4} className="min-h-28 w-full px-3.5 py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2" style={inputStyle} />
            ) : field.fieldType === "select" ? (
              <select name={field.label} required={field.required} defaultValue="" className="min-h-12 w-full px-3.5 py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2" style={inputStyle}>
                <option value="" disabled>Choose an option</option>
                {(field.options ?? []).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input name={field.label} type={field.fieldType} required={field.required} className="min-h-12 w-full px-3.5 py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2" style={inputStyle} />
            )}
          </label>
        )
      ))}
      <button type="submit"
        className="min-h-12 px-6 py-3 font-semibold transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)", borderRadius: "var(--radius-sm)", outlineColor: "var(--color-secondary)" }}>
        {submitText}
      </button>
      {note ? <p className="text-sm" style={{ color: "var(--color-muted)" }}>{note}</p> : null}
    </FormSubmission>
  );
}
