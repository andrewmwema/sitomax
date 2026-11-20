export function AgencyBrand({ name, logoUrl, subtitle, compact = false }: {
  name: string;
  logoUrl: string | null;
  subtitle: string;
  compact?: boolean;
}) {
  return <div className={`flex min-w-0 flex-1 ${compact ? "justify-center" : "items-center gap-2.5"}`}>
    {logoUrl ? <div className="min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- agency logos use configured storage URLs */}
      <img src={logoUrl} alt={name} width={compact ? 40 : 176} height={40}
        className={`platform-agency-logo ${compact ? "platform-agency-logo-compact" : ""}`} />
      {!compact ? <p className="mt-1 text-xs text-[var(--platform-muted)]">{subtitle}</p> : null}
    </div> : <>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--platform-ink)] text-sm font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
      {compact ? <span className="sr-only">{name}</span> : <div className="min-w-0">
        <strong className="block truncate text-sm font-semibold tracking-tight">{name}</strong>
        <p className="text-xs text-[var(--platform-muted)]">{subtitle}</p>
      </div>}
    </>}
  </div>;
}
