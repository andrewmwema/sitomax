import type { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, CSSProperties> = {
  // --btn-* vars are set by dark/primary Sections and by SectionShell's
  // light text scheme (photo/video backgrounds), so primary buttons use
  // the accent (or white) and secondary buttons a white outline there.
  primary: {
    backgroundColor: "var(--btn-bg, var(--color-primary))",
    color: "var(--btn-fg, var(--color-on-primary))",
    border: "1px solid transparent",
  },
  secondary: {
    backgroundColor: "transparent",
    color: "inherit",
    border: "1px solid var(--btn-outline, var(--color-border))",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--color-primary)",
    border: "1px solid transparent",
  },
};

/**
 * Block button/link. 48px minimum hit target, hover lift and a visible
 * focus ring. Rendered as an anchor because block CTAs navigate.
 */
export function Button({
  href = "#",
  variant = "primary",
  children,
  className = "",
  style,
}: {
  href?: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={href || "#"}
      className={`inline-flex min-h-12 items-center justify-center gap-2 px-6 py-3 text-base font-semibold no-underline transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-body)",
        outlineColor: "var(--color-secondary)",
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </a>
  );
}
