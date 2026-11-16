import type { CustomField, RadioField, SelectField } from "@puckeditor/core";
import {
  FONT_OPTIONS,
  SPACING_OPTIONS,
  type Align,
  type ColorChoice,
  type FontChoice,
  type FontWeightChoice,
  type TypeSize,
} from "@/lib/layout/guardrails";
import type { RowLayout } from "@/lib/layout/structure";
import {
  DateTimeControl,
  RowLayoutControl,
  ThemeColorControl,
  TypeSizeControl,
} from "@/components/editor/layout-controls";

/**
 * Guardrailed Puck fields for the layout system: spacing from the
 * scale, sizes from the type scale, fonts from the curated list and
 * colors from the theme palette.
 */

export function spacingField(label: string): SelectField {
  return { type: "select", label, options: SPACING_OPTIONS };
}

export function typeSizeField(
  label: string,
  defaultLabel?: string,
): CustomField<TypeSize | "auto"> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <TypeSizeControl
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        defaultLabel={defaultLabel}
      />
    ),
  };
}

export function colorField(
  label: string,
  { allowAuto = true }: { allowAuto?: boolean } = {},
): CustomField<ColorChoice> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <ThemeColorControl
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        allowAuto={allowAuto}
      />
    ),
  };
}

export function fontField(label = "Font"): SelectField {
  return { type: "select", label, options: FONT_OPTIONS satisfies { value: FontChoice }[] };
}

export function fontWeightField(label = "Weight"): SelectField {
  const options: { label: string; value: FontWeightChoice }[] = [
    { label: "Theme default", value: "theme" },
    { label: "Regular", value: "regular" },
    { label: "Medium", value: "medium" },
    { label: "Semibold", value: "semibold" },
    { label: "Bold", value: "bold" },
  ];
  return { type: "select", label, options };
}

export function alignField(label = "Alignment"): RadioField {
  const options: { label: string; value: Align }[] = [
    { label: "Left", value: "left" },
    { label: "Center", value: "center" },
    { label: "Right", value: "right" },
  ];
  return { type: "radio", label, options };
}

export function dateTimeField(label: string): CustomField<string> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <DateTimeControl value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}

export function rowLayoutField(label = "Columns"): CustomField<RowLayout> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <RowLayoutControl value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
}
