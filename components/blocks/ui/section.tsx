import type { CSSProperties, ReactNode } from "react";
import { Container } from "./container";

export type SectionBackground = "default" | "soft" | "dark" | "primary";

const BACKGROUNDS: Record<SectionBackground, CSSProperties> = {
  // --section-bg-override lets SectionShell make the section transparent
  // when a custom design background (color / image / video) is active.
  default: {
    backgroundColor: "var(--section-bg-override, var(--color-bg))",
    color: "var(--shell-text-override, var(--color-on-bg, var(--color-text)))",
    "--color-text": "var(--shell-text-override, var(--color-on-bg, var(--color-text)))",
    "--color-muted": "var(--shell-text-override, var(--color-on-bg))",
  } as CSSProperties,
  soft: {
    backgroundColor: "var(--section-bg-override, var(--color-soft-bg))",
    color: "var(--shell-text-override, var(--color-on-soft-bg, var(--color-text)))",
    "--color-text": "var(--shell-text-override, var(--color-on-soft-bg, var(--color-text)))",
    "--color-muted": "var(--shell-text-override, var(--color-on-soft-bg))",
  } as CSSProperties,
  dark: {
    backgroundColor: "var(--section-bg-override, var(--color-dark-bg))",
    color: "var(--shell-text-override, var(--color-on-dark-bg, var(--color-bg)))",
    // Re-derive tints for light-on-dark content.
    "--color-text": "var(--shell-text-override, var(--color-on-dark-bg, var(--color-bg)))",
    "--color-muted": "var(--shell-text-override, var(--color-on-dark-bg))",
    "--color-border": "color-mix(in srgb, var(--shell-text-override, var(--color-on-dark-bg, var(--color-bg))) 18%, transparent)",
    // Buttons on dark: accent primary (white if low contrast).
    "--btn-bg": "var(--color-cta-dark)",
    "--btn-fg": "var(--color-on-cta-dark)",
  } as CSSProperties,
  primary: {
    backgroundColor: "var(--section-bg-override, var(--color-primary))",
    color: "var(--shell-text-override, var(--color-on-primary))",
    "--color-text": "var(--shell-text-override, var(--color-on-primary))",
    "--color-muted": "var(--shell-text-override, var(--color-on-primary))",
    "--color-border": "color-mix(in srgb, var(--color-on-primary) 25%, transparent)",
    "--btn-bg": "var(--color-cta-primary)",
    "--btn-fg": "var(--color-on-cta-primary)",
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
        // SectionShell can override the vertical rhythm per device.
        paddingTop: "var(--section-pad-top, var(--section-pad))",
        paddingBottom: "var(--section-pad-bottom, var(--section-pad))",
        ...BACKGROUNDS[background],
        ...style,
      }}
    >
      {container ? <Container>{children}</Container> : children}
    </section>
  );
}
