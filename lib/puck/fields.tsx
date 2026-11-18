import type { CustomField, RichtextField } from "@puckeditor/core";
import type { BlockDesign, DesignLevel } from "@/lib/sections/design";
import { PuckImageField } from "@/components/editor/puck-image-field";
import { IconPickerField } from "@/components/editor/icon-picker-field";
import { DesignField } from "@/components/editor/design-field";
import { RichTextToolbar } from "@/components/editor/rich-text-toolbar";
import { editorTextExtensions } from "./richtext-extensions";

/**
 * Reusable image field for blocks. The field UI only ever renders inside
 * the (client-side) editor; the public renderer never calls it.
 */
export function imageField(label: string): CustomField<string> & { aiKind: "image" } {
  return {
    type: "custom",
    aiKind: "image",
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <PuckImageField name={name} value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

/** Reusable icon field: searchable picker over the curated lucide set. */
export function iconField(label: string): CustomField<string> & { aiKind: "icon" } {
  return {
    type: "custom",
    aiKind: "icon",
    label,
    render: ({ value, onChange, readOnly }) => (
      <IconPickerField value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

/**
 * Word-style body text field: editable directly on the canvas and in the
 * sidebar, with formatting, links, lists, headings and alignment.
 * Values are HTML — always render them through <RichTextContent>, which
 * sanitizes (see lib/richtext.ts).
 */
export function richTextField(label: string): RichtextField {
  return {
    type: "richtext",
    label,
    contentEditable: true,
    options: {
      heading: { levels: [1, 2, 3, 4] },
      textAlign: { types: ["heading", "paragraph"] },
      // Keep the toolbar focused on safe, supported marks.
      code: false,
      codeBlock: false,
      horizontalRule: false,
    },
    tiptap: { extensions: editorTextExtensions },
    renderMenu: (props) => <RichTextToolbar {...props} />,
    renderInlineMenu: (props) => <RichTextToolbar {...props} floating />,
  };
}

/**
 * Shared "design" object for every block (SectionShell): Settings /
 * Style / Animation / Spacing tabs in the right-hand panel (rows,
 * columns and elements get Style / Animation / Spacing). Values are
 * validated again at render time (lib/sections/design.ts).
 */
export function designField(level: DesignLevel = "section"): CustomField<BlockDesign | undefined> {
  return {
    type: "custom",
    label: "Design",
    render: ({ value, onChange, readOnly }) => (
      <DesignField value={value} onChange={onChange} readOnly={readOnly} level={level} />
    ),
  };
}
