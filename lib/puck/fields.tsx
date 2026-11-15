import type { CustomField } from "@puckeditor/core";
import { ImageUploadField } from "@/components/editor/image-upload-field";

/**
 * Reusable image field for blocks. The field UI only ever renders inside
 * the (client-side) editor; the public renderer never calls it.
 */
export function imageField(label: string): CustomField<string> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <ImageUploadField value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}
