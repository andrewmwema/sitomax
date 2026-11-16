import type { CSSProperties } from "react";
import type { RichText } from "@puckeditor/core";
import { renderableRichText } from "@/lib/richtext";
import { CURATED_FONT_NAMES, googleFontsUrl } from "@/lib/theme/fonts";

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
    const clean = renderableRichText(value);
    const families = new Set(
      [...clean.matchAll(/font-family:\s*(?:&quot;([^&]*)&quot;|([^;"&]+))/g)]
        .map((match) => (match[1] ?? match[2]).trim()),
    );
    const fonts = CURATED_FONT_NAMES.filter((font) => families.has(font));
    return (
      <>
      {fonts.length ? <link rel="stylesheet" href={googleFontsUrl(fonts)} /> : null}
      <div
        className={`rich-text ${className}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      </>
    );
  }

  return (
    <div className={`rich-text ${className}`} style={style}>
      {value}
    </div>
  );
}
