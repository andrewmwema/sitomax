import type { ComponentConfig } from "@puckeditor/core";
import { designField } from "@/lib/puck/fields";
import type { BlockDesign } from "@/lib/sections/design";
import {
  EnquiryForm,
  enquiryFields,
  enquiryFieldsField,
  type EnquiryField,
} from "../ui/enquiry-form";

export type FormElementProps = {
  design?: BlockDesign;
  formName: string;
  fields: EnquiryField[];
  submitText: string;
  note: string;
};

export const FormElement: ComponentConfig<FormElementProps> = {
  label: "Form",
  inline: true,
  fields: {
    formName: { type: "text", label: "Form name (shown in your submissions)" },
    fields: enquiryFieldsField,
    submitText: { type: "text", label: "Button text" },
    note: { type: "text", label: "Small print (optional)" },
    design: designField("element"),
  },
  defaultProps: {
    design: {},
    formName: "Contact form",
    fields: enquiryFields,
    submitText: "Send message",
    note: "",
  },
  render: ({ formName, fields, submitText, note, puck }) => (
    <div
      style={{ pointerEvents: puck.isEditing ? "none" : undefined }}
      onSubmit={puck.isEditing ? (e) => e.preventDefault() : undefined}
    >
      <EnquiryForm
        formName={formName || "Contact form"}
        fields={fields ?? []}
        submitText={submitText || "Send"}
        note={note || undefined}
      />
    </div>
  ),
};
