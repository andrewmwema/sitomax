import type { CSSProperties, ReactNode } from "react";

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
