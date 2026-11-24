import type { CustomField, RichtextField } from "@puckeditor/core";
import type { BlockDesign, DesignLevel } from "@/lib/sections/design";
import { PuckImageField } from "@/components/editor/puck-image-field";
import { IconPickerField } from "@/components/editor/icon-picker-field";
import { DesignField } from "@/components/editor/design-field";
import { RichTextToolbar } from "@/components/editor/rich-text-toolbar";
import { LinkFieldControl } from "@/components/editor/link-picker";
import type { LinkValue, SiteLink } from "@/lib/links";
import type { IconValue } from "@/lib/icons";
import { editorTextExtensions } from "./richtext-extensions";

/**
 * Reusable image field for blocks. The field UI only ever renders inside
 * the (client-side) editor; the public renderer never calls it.
 */
export type ImageAspectRatio = "auto" | "1/1" | "4/3" | "3/2" | "16/9" | "3/4" | "4/5" | "9/16";
export type ImageAspectMetadata = ImageAspectRatio | readonly ImageAspectRatio[];

export function imageField(
  label: string,
  aiAspectRatio: ImageAspectMetadata = "auto",
): CustomField<string> & { aiKind: "image"; aiAspectRatio: ImageAspectMetadata } {
  return {
    type: "custom",
    aiKind: "image",
    aiAspectRatio,
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <PuckImageField name={name} value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

export function optionalImageField(
  label: string,
  aiAspectRatio: ImageAspectMetadata = "auto",
): CustomField<string | undefined> & { aiKind: "image"; aiAspectRatio: ImageAspectMetadata } {
  return {
    type: "custom",
    aiKind: "image",
    aiAspectRatio,
    label,
    render: ({ name, value, onChange, readOnly }) => (
      <PuckImageField name={name} value={value ?? ""} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

/**
 * Shared link field (buttons, menus, cards, images). Stores a typed
 * SiteLink; page links keep the page id and resolve to the current slug at
 * render time (lib/links.ts). Legacy string values still render.
 */
export function linkField(label: string): CustomField<LinkValue> & { aiKind: "link" } {
  return {
    type: "custom",
    aiKind: "link",
    label,
    render: ({ value, onChange, readOnly }) => (
      <LinkFieldControl value={value} readOnly={readOnly} onChange={(next: SiteLink | "") => onChange(next)} />
    ),
  };
}

/** Reusable icon field: searchable picker over the curated lucide set. */
export function iconField(label: string): CustomField<IconValue> & { aiKind: "icon" } {
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
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      textAlign: { types: ["heading", "paragraph"] },
      // Keep the toolbar focused on safe, supported marks.
      code: false,
      codeBlock: false,
      horizontalRule: false,
      // New tab and nofollow are opt-in through the link picker.
      link: { openOnClick: false, HTMLAttributes: { target: null, rel: "noopener noreferrer" } },
    },
    tiptap: { extensions: editorTextExtensions },
    renderMenu: (props) => <RichTextToolbar {...props} floating />,
    renderInlineMenu: (props) => <RichTextToolbar {...props} floating />,
  };
}

export function richHeadingField(label: string, level: 1 | 2): RichtextField & { headingLevel: 1 | 2 } {
  return {
    ...richTextField(label),
    headingLevel: level,
    renderMenu: (props) => <RichTextToolbar {...props} floating initialHeadingLevel={level} />,
    renderInlineMenu: (props) => <RichTextToolbar {...props} floating initialHeadingLevel={level} />,
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
