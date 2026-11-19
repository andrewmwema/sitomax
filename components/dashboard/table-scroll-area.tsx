import type { ReactNode } from "react";

export function TableScrollArea({ label, children, className = "" }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return <div role="region" aria-label={label} tabIndex={0} className={`platform-table-scroll overflow-x-auto ${className}`}>{children}</div>;
}
