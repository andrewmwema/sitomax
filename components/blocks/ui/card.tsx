import type { CSSProperties, ReactNode } from "react";

/** Surface for list items: preset radius, hairline border and card shadow. */
export function Card({
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
      className={`flex flex-col gap-3 p-6 sm:p-7 ${className}`}
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
