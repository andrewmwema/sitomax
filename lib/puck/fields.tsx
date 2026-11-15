import type { CustomField, RichtextField } from "@puckeditor/core";
import type { BlockDesign } from "@/lib/sections/design";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { IconPickerField } from "@/components/editor/icon-picker-field";
import { DesignField } from "@/components/editor/design-field";

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

/** Reusable icon field: searchable picker over the curated lucide set. */
export function iconField(label: string): CustomField<string> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <IconPickerField value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

/**
 * Word-style body text field: editable directly on the canvas and in the
 * sidebar, with bold/italic/underline, links, lists, H2–H4 and alignment.
 * Values are HTML — always render them through <RichTextContent>, which
 * sanitizes (see lib/richtext.ts).
 */
export function richTextField(label: string): RichtextField {
  return {
    type: "richtext",
    label,
    contentEditable: true,
    options: {
      heading: { levels: [2, 3, 4] },
      textAlign: { types: ["heading", "paragraph"] },
      // Keep the toolbar focused on safe, supported marks.
      code: false,
      codeBlock: false,
      strike: false,
      horizontalRule: false,
    },
  };
}

/**
 * Shared "design" object for every block (SectionShell): Settings /
 * Style / Animation / Spacing tabs in the right-hand panel. Values are
 * validated again at render time (lib/sections/design.ts).
 */
export function designField(): CustomField<BlockDesign | undefined> {
  return {
    type: "custom",
    label: "Design",
    render: ({ value, onChange, readOnly }) => (
      <DesignField value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}
