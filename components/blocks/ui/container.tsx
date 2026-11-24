import type { CSSProperties, ReactNode } from "react";

/** Centered content column, width capped by the preset's --container. */
export function Container({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`mx-auto w-full px-5 sm:px-8 ${className}`}
      style={{ maxWidth: "var(--section-content-width, var(--container))", ...style }}
    >
      {children}
    </div>
  );
}
