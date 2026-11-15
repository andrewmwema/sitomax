import type { ReactNode } from "react";

/** Small pill label (e.g. a highlighted pricing plan). */
export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${className}`}
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, var(--color-bg))",
        color: "var(--color-primary)",
        fontFamily: "var(--font-body)",
      }}
    >
      {children}
    </span>
  );
}
