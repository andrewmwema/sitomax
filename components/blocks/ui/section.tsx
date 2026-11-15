import type { CSSProperties, ReactNode } from "react";
import { Container } from "./container";

export type SectionBackground = "default" | "soft" | "dark" | "primary";

const BACKGROUNDS: Record<SectionBackground, CSSProperties> = {
  default: {
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text)",
  },
  soft: {
    backgroundColor: "var(--color-soft-bg)",
    color: "var(--color-text)",
  },
  dark: {
    backgroundColor: "var(--color-dark-bg)",
    color: "var(--color-bg)",
    // Re-derive tints for light-on-dark content.
    "--color-muted": "color-mix(in srgb, var(--color-bg) 72%, transparent)",
    "--color-border": "color-mix(in srgb, var(--color-bg) 18%, transparent)",
  } as CSSProperties,
  primary: {
    backgroundColor: "var(--color-primary)",
    color: "var(--color-on-primary)",
    "--color-muted": "color-mix(in srgb, var(--color-on-primary) 78%, transparent)",
    "--color-border": "color-mix(in srgb, var(--color-on-primary) 25%, transparent)",
  } as CSSProperties,
};

/**
 * Standard block wrapper: vertical rhythm from --section-pad and one of
 * four background treatments. Every block renders inside a Section.
 */
export function Section({
  background = "default",
  children,
  container = true,
  className = "",
  style,
}: {
  background?: SectionBackground;
  children: ReactNode;
  /** Set false when the block manages its own container (e.g. Hero split). */
  container?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`w-full ${className}`}
      style={{
        paddingTop: "var(--section-pad)",
        paddingBottom: "var(--section-pad)",
        ...BACKGROUNDS[background],
        ...style,
      }}
    >
      {container ? <Container>{children}</Container> : children}
    </section>
  );
}
