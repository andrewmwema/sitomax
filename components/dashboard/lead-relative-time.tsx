export function RelativeLeadTime({ value }: { value?: string | null }) {
  if (!value) return <span className="shrink-0 text-[10px] text-[var(--platform-muted)]">New</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const label = date.toLocaleDateString("en", { month: "short", day: "numeric" });
  return <time dateTime={date.toISOString()} className="shrink-0 text-[10px] text-[var(--platform-muted)]">{label}</time>;
}
