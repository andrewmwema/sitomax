import type { ReactNode } from "react";

/** Small uppercase label above a heading, letter-spaced, in the accent color. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs font-semibold uppercase ${className}`}
      style={{
        color: "var(--color-secondary)",
        letterSpacing: "0.14em",
        fontFamily: "var(--font-body)",
      }}
    >
      {children}
    </p>
  );
}
