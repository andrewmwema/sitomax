import Link from "next/link";
import { BarChart3, Globe2, Inbox, Info, MousePointerClick, Users } from "lucide-react";
import type { SiteAnalyticsReport } from "@/lib/analytics";
import { WorkspaceMetrics } from "./workspace-metrics";
import { TableScrollArea } from "./table-scroll-area";

export function AnalyticsReport({ report, siteId, siteName, days }: {
  report: SiteAnalyticsReport; siteId: string; siteName: string; days: number;
}) {
  return <>
    <WorkspaceMetrics metrics={[
      { label: "Total visits", value: report.visits, detail: `${days} calendar days · includes today`, icon: Globe2 },
      { label: "Daily unique visitors", value: report.unique_visitors, detail: "Sum of each day's unique visitors", icon: Users },
      { label: "Form submissions", value: report.form_submissions, detail: "Received in the same UTC period", icon: Inbox },
      { label: "CTA clicks", value: report.cta_clicks, detail: "Tracked section buttons", icon: MousePointerClick },
    ]} />
    <section className="platform-panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--platform-line)] px-5 py-4">
        <div><h2 className="text-[15px] font-semibold">Traffic performance</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">{siteName} · visits by day</p></div>
        <span className="platform-status">Last {days} days · UTC</span>
      </header>
      <VisitsChart daily={report.daily} visits={report.visits} />
    </section>
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <Breakdown title="Top pages" description="Pages with the most recorded visits." rows={report.pages} total={report.visits} empty="Visited pages will appear once traffic is recorded." />
      <Breakdown title="Top referrers" description="Sources of recorded website visits." rows={report.referrers} total={report.visits} empty="Traffic sources will appear when visitors arrive." />
      <Breakdown title="Devices" description="Device types identified from visits." rows={report.devices} total={report.visits} empty="Device insights will appear with your first visits." />
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)]">
      <section className="platform-panel p-5"><div className="flex items-center gap-2"><Info size={16} className="text-[var(--platform-muted)]" /><h2 className="text-sm font-semibold">How to read this report</h2></div>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--platform-muted)]">
          <li>Dates and reporting periods use UTC. Today is included and may be incomplete.</li>
          <li>Visitor identifiers change daily. The same visitor can be counted on more than one day, so daily uniques are not a deduplicated audience for the entire period.</li>
          <li>CTA clicks are counted in aggregate; they are not tied to an individual visitor or attributed to a form submission.</li>
          <li>Conversion rates and period comparisons are not shown: the current report does not attribute submissions to visits or return a comparable previous period.</li>
        </ul>
      </section>
      <section className="platform-panel p-5"><h2 className="text-sm font-semibold">Lead performance</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--platform-muted)]">{report.form_submissions ? `${report.form_submissions.toLocaleString("en")} submissions received during this reporting period.` : "No submissions in this period. Publish a contact form to start collecting inquiries."}</p>
        <Link href={`/dashboard/forms?site=${encodeURIComponent(siteId)}`} className="platform-button mt-4"><Inbox size={14} />View submissions</Link>
      </section>
    </div>
  </>;
}

export function VisitsChart({ daily, visits }: { daily: SiteAnalyticsReport["daily"]; visits: number }) {
  const max = Math.max(0, ...daily.map((day) => day.visits));
  if (!visits || !max) return <div className="px-6 py-10 text-center">
    <BarChart3 size={26} className="mx-auto text-[var(--platform-muted)]" /><h3 className="mt-3 text-sm font-semibold">No traffic recorded in this period</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--platform-muted)]">Enable analytics for a published website to see visits here. You can also try another website or date range.</p>
  </div>;
  const points = daily.map((day, index) => `${40 + index * 520 / Math.max(1, daily.length - 1)},${165 - day.visits * 140 / max}`);
  return <div className="p-5">
    <div className="flex items-center gap-2 text-xs text-[var(--platform-muted)]"><span className="size-2 rounded-full bg-[var(--platform-accent)]" />Recorded visits</div>
    <svg viewBox="0 0 600 195" role="img" aria-label={`Daily visits from ${daily[0]?.day} to ${daily[daily.length - 1]?.day}. Maximum ${max.toLocaleString("en")} visits per day.`}
      className="mt-4 h-48 w-full sm:h-56" preserveAspectRatio="none">
      <path d="M40 25H560M40 165H560" fill="none" stroke="var(--platform-line)" strokeDasharray="4 4" />
      <text x="5" y="29" fill="var(--platform-muted)" fontSize="10">{max}</text><text x="20" y="168" fill="var(--platform-muted)" fontSize="10">0</text>
      <polygon points={`40,165 ${points.join(" ")} 560,165`} fill="var(--platform-accent)" opacity="0.05" />
      <polyline points={points.join(" ")} fill="none" stroke="var(--platform-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="flex justify-between gap-3 text-xs text-[var(--platform-muted)]"><span>{daily[0]?.day}</span><span>{daily[daily.length - 1]?.day}</span></div>
    <details className="mt-4 border-t border-[var(--platform-line)] pt-3">
      <summary className="w-fit text-xs font-medium text-[var(--platform-secondary)]">View daily values</summary>
      <TableScrollArea label="Daily traffic values" className="mt-3 max-h-64"><table className="w-full text-left text-xs"><caption className="sr-only">Daily recorded visits in UTC</caption>
        <thead><tr><th className="px-3">Date (UTC)</th><th className="px-3 text-right">Visits</th></tr></thead>
        <tbody>{daily.map((day) => <tr key={day.day}><td className="px-3">{day.day}</td><td className="px-3 text-right tabular-nums">{day.visits.toLocaleString("en")}</td></tr>)}</tbody>
      </table></TableScrollArea>
    </details>
  </div>;
}

function Breakdown({ title, description, rows, total, empty }: {
  title: string; description: string; rows: { label: string; count: number }[]; total: number; empty: string;
}) {
  return <section className="platform-panel p-5"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">{description}</p>
    {rows.length ? <ul className="mt-4 space-y-4">{rows.map((row) => {
      const percent = total ? Math.min(100, row.count / total * 100) : 0;
      return <li key={row.label}><div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0 break-all text-[var(--platform-secondary)]">{row.label}</span><span className="shrink-0 font-medium tabular-nums">{row.count.toLocaleString("en")}</span>
      </div><div aria-hidden="true" className="mt-2 h-1 rounded-full bg-[var(--platform-ground)]"><div className="h-full rounded-full bg-[var(--platform-accent)] opacity-60" style={{ width: `${percent}%` }} /></div></li>;
    })}</ul> : <p className="mt-4 rounded-lg bg-[var(--platform-ground)] p-4 text-xs leading-relaxed text-[var(--platform-muted)]">{empty}</p>}
  </section>;
}
