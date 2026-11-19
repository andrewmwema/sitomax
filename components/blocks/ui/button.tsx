import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { resolveLink } from "@/lib/links";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, CSSProperties> = {
  // --btn-* vars are set by dark/primary Sections and by SectionShell's
  // light text scheme (photo/video backgrounds), so primary buttons use
  // the accent (or white). Outlines follow the readable foreground.
  primary: {
    backgroundColor: "var(--btn-bg, var(--color-primary))",
    color: "var(--btn-fg, var(--color-on-primary))",
    border: "1px solid transparent",
  },
  secondary: {
    backgroundColor: "transparent",
    color: "inherit",
    border: "1px solid currentColor",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "inherit",
    border: "1px solid transparent",
  },
};

/**
 * Block button/link. 48px minimum hit target, hover lift and a visible
 * focus ring. Rendered as an anchor because block CTAs navigate. `href`
 * takes any stored link (typed, rendered or legacy string) and is
 * resolved to a safe target here.
 */
export function Button({
  href,
  variant = "primary",
  children,
  className = "",
  style,
  onClick,
  newTab = false,
}: {
  href?: unknown;
  newTab?: boolean;
  variant?: Variant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const link = resolveLink(href);
  const rel = [link.newTab || newTab ? "noopener noreferrer" : "", link.nofollow ? "nofollow" : ""].filter(Boolean).join(" ");
  return (
    <a
      href={link.href}
      onClick={onClick}
      {...(link.newTab || newTab ? { target: "_blank" } : null)}
      {...(rel ? { rel } : null)}
      className={`site-button inline-flex min-h-12 items-center justify-center gap-2 px-6 py-3 text-center text-base font-semibold whitespace-normal no-underline transition hover:-translate-y-px hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{
        borderRadius: "var(--button-radius, var(--radius-sm))",
        fontFamily: "var(--font-body)",
        outlineColor: "currentColor",
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </a>
  );
}
