import type { CSSProperties, ReactNode } from "react";
import { isRichHeading, sanitizeRichText } from "@/lib/richtext";
import { CURATED_FONT_NAMES, googleFontsUrl } from "@/lib/theme/fonts";

type Level = 1 | 2 | 3;

const SIZES: Record<Level, CSSProperties> = {
  1: {
    fontSize: "clamp(2.25rem, 1.35rem + 3.6vw, 3.5rem)",
    letterSpacing: "-1.5px",
    lineHeight: 1.12,
  },
  2: {
    fontSize: "clamp(1.75rem, 1.3rem + 1.8vw, 2.5rem)",
    letterSpacing: "-1px",
    lineHeight: 1.18,
  },
  3: {
    fontSize: "clamp(1.2rem, 1.08rem + 0.5vw, 1.45rem)",
    letterSpacing: "-0.5px",
    lineHeight: 1.3,
  },
};

/** Fluid display heading in the preset's heading font. */
export function Heading({
  level = 2,
  children,
  className = "",
  style,
}: {
  level?: Level;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={className}
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
        ...SIZES[level],
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function RichHeading({ level = 2, children, className = "", style, customSize = false }: {
  level?: Level | 4;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  customSize?: boolean;
}) {
  const headingStyle: CSSProperties = {
    fontFamily: "var(--font-heading)",
    fontWeight: "var(--heading-weight)" as CSSProperties["fontWeight"],
    ...(customSize ? {} : SIZES[level === 4 ? 3 : level]),
    ...style,
  };
  if (typeof children === "string" && !isRichHeading(children)) {
    const Tag = `h${level}` as const;
    return <Tag className={className} style={headingStyle}>{children}</Tag>;
  }
  const classes = `rich-heading${customSize ? " rich-heading--custom-size" : ""} ${className}`;
  if (typeof children !== "string") {
    return <div className={classes} style={headingStyle}>{children}</div>;
  }
  const clean = sanitizeRichText(children);
  const families = new Set([...clean.matchAll(/font-family:\s*(?:&quot;([^&]*)&quot;|([^;"&]+))/g)]
    .map((match) => (match[1] ?? match[2]).trim()));
  const fonts = CURATED_FONT_NAMES.filter((font) => families.has(font));
  return <>
    {fonts.length ? <link rel="stylesheet" href={googleFontsUrl(fonts)} /> : null}
    <div className={classes} style={headingStyle} dangerouslySetInnerHTML={{ __html: clean }} />
  </>;
}
