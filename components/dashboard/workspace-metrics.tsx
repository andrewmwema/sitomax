import type { LucideIcon } from "lucide-react";

export function WorkspaceMetrics({ metrics }: {
  metrics: { label: string; value: number | string; detail: string; icon: LucideIcon }[];
}) {
  return <section aria-label="Workspace summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {metrics.map(({ label, value, detail, icon: Icon }) => <div key={label} className="platform-panel p-5">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-[var(--platform-muted)]">{label}</p><Icon size={16} className="text-[var(--platform-muted)]" strokeWidth={1.6} /></div>
      <p className="mt-3 text-[28px] leading-tight font-semibold tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString("en") : value}</p>
      <p className="mt-1 text-xs text-[var(--platform-muted)]">{detail}</p>
    </div>)}
  </section>;
}
