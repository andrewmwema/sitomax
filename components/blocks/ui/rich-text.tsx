import type { CSSProperties } from "react";
import type { RichText } from "@puckeditor/core";
import { renderableRichText } from "@/lib/richtext";

/**
 * Renders a rich text field value.
 *
 * - On the public site (and for stored data) the value is an HTML string:
 *   it is sanitized and rendered inside the shared .rich-text styles.
 * - In the editor Puck transforms the value into a TipTap ReactNode for
 *   inline editing, which is rendered as-is inside the same wrapper so
 *   the editing experience matches the published output.
 */
export function RichTextContent({
  value,
  className = "",
  style,
}: {
  value: RichText | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  if (value == null) return null;

  if (typeof value === "string") {
    return (
      <div
        className={`rich-text ${className}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: renderableRichText(value) }}
      />
    );
  }

  return (
    <div className={`rich-text ${className}`} style={style}>
      {value}
    </div>
  );
}
