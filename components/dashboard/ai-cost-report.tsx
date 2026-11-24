import Link from "next/link";
import { Activity, CircleDollarSign, Clock3, Info, Sparkles, Users } from "lucide-react";
import type { AiUsageSummary, MonthlyAiReport } from "@/lib/ai/reporting";
import { formatAiCost } from "@/lib/ai/cost-format";
import { reportingDays, reportingPeriod } from "@/lib/ai/reporting-period";
import { WorkspaceMetrics } from "./workspace-metrics";
import { TableScrollArea } from "./table-scroll-area";

export type AiCostSite = { id: string; account_id: string; name: string | null; subdomain: string };

const ACTIONS = [
  ["site_generation", "Site generation"],
  ["agent_run", "Agent runs"],
  ["edit", "Edits"],
  ["lead_draft", "Lead drafts"],
  ["blog_ai", "Blog AI"],
] as const;

export function AiCostReport({ report, usage, sites, month, currentMonth }: {
  report: MonthlyAiReport;
  usage: AiUsageSummary[] | null;
  sites: AiCostSite[] | null;
  month: string;
  currentMonth: string;
}) {
  const { clients: rows, totals } = report;
  const spend = totals.clients + totals.agency + totals.evals;
  const active = rows.filter((row) => row.requests > 0).length;
  const pending = usage?.reduce((total, row) => total + row.pending_requests, 0);
  const usageByAccount = new Map(usage?.map((row) => [row.account_id, row]));
  const topClients = [...rows].filter((row) => row.cost_usd + row.agency_cost_usd > 0)
    .sort((a, b) => b.cost_usd + b.agency_cost_usd - a.cost_usd - a.agency_cost_usd).slice(0, 5);
  const largest = topClients.length ? topClients[0].cost_usd + topClients[0].agency_cost_usd : 0;
  const quotaPeriod = reportingPeriod(currentMonth);
  return <>
    <WorkspaceMetrics metrics={[
      { label: "Total AI spend", value: formatAiCost(spend), detail: "Recorded provider usage · selected month", icon: CircleDollarSign },
      { label: "Recorded usage entries", value: totals.requests, detail: "Agent runs and individual API calls", icon: Activity },
      { label: "Active AI clients", value: active, detail: "Clients with their own recorded usage", icon: Users },
      { label: "Average cost / entry", value: formatAiCost(totals.requests ? spend / totals.requests : 0), detail: "Estimated · selected month", icon: Sparkles },
    ]} />
    <section className="platform-panel p-5">
      <h2 className="text-sm font-semibold">Spend split</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[["Clients", totals.clients], ["Agency (internal)", totals.agency], ["Evals / scripts", totals.evals]].map(([label, amount]) =>
          <div key={label} className="rounded-lg bg-[var(--platform-ground)] p-4"><p className="text-xs text-[var(--platform-muted)]">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatAiCost(Number(amount), true)}</p></div>)}
      </div>
    </section>
    <SpendChart report={report} month={month} />
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="platform-panel p-5"><h2 className="text-[15px] font-semibold">Agency usage</h2>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">Agency requests on all accounts, including internal sites · {month}</p>
        <TableScrollArea label="Agency AI usage by action" className="mt-4"><table className="w-full text-left text-xs">
          <thead><tr><th>Action</th><th className="text-right">Requests</th><th className="text-right">Tokens</th><th className="text-right">Cost</th></tr></thead>
          <tbody>{ACTIONS.map(([key, label]) => {
            const row = report.agency.find((entry) => entry.action_type === key);
            return <tr key={key}><th scope="row" className="font-normal">{label}</th><td className="text-right tabular-nums">{(row?.requests ?? 0).toLocaleString("en")}</td>
              <td className="text-right tabular-nums">{(row?.tokens ?? 0).toLocaleString("en")}</td><td className="text-right tabular-nums">{formatAiCost(row?.cost_usd ?? 0, true)}</td></tr>;
          })}</tbody>
        </table></TableScrollArea>
        <p className="mt-3 text-xs text-[var(--platform-muted)]">Tokens include input, output and cache reads and writes. Older lead and blog requests cannot be distinguished from edits.</p>
      </section>
      <section className="platform-panel p-5"><h2 className="text-[15px] font-semibold">Cost to serve by client</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Top five · client and agency work combined</p>
        {topClients.length ? <ul className="mt-5 space-y-4">{topClients.map((row) => <li key={row.account_id}>
          <div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{row.account_name}</span><span className="shrink-0 tabular-nums">{formatAiCost(row.cost_usd + row.agency_cost_usd, true)}</span></div>
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--platform-ground)]"><div className="h-full rounded-full bg-[var(--platform-accent)] opacity-70" style={{ width: `${(row.cost_usd + row.agency_cost_usd) / largest * 100}%` }} /></div>
        </li>)}</ul> : <p className="py-7 text-center text-xs text-[var(--platform-muted)]">No client spending recorded in this period.</p>}
      </section>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="platform-panel p-5"><div className="flex items-center gap-2"><Clock3 size={16} className="text-[var(--platform-muted)]" /><h2 className="text-sm font-semibold">Held requests right now</h2></div>
        <p className="mt-3 text-[28px] font-semibold tracking-tight tabular-nums">{pending === undefined ? "Unavailable" : pending.toLocaleString("en")}</p>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">Current allowance period: {quotaPeriod.start} to {quotaPeriod.end} (exclusive). Held requests are not confirmed costs.</p>
        {!usage ? <p role="alert" className="mt-3 text-xs text-[var(--platform-error)]">Could not load current allowances and reservations. Please retry.</p> : null}
      </section>
      <section className="platform-panel p-5"><div className="flex items-center gap-2"><Info size={16} className="text-[var(--platform-muted)]" /><h2 className="text-sm font-semibold">Estimates, not billing charges</h2></div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--platform-muted)]">Configured token rates and recorded usage are estimates. Earlier scripts, uncertain provider outcomes and pending accounting are not included. Agent runs can contain multiple API calls.</p>
        <a href="https://console.anthropic.com/settings/usage" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-[var(--platform-accent)] underline">Compare with Anthropic Console</a>
      </section>
    </div>
    <section className="platform-panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--platform-line)] px-5 py-4">
        <div><h2 className="text-[15px] font-semibold">Client usage &amp; allocation</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Costs and credits charged: {month}. Remaining credits and included allocation are current.</p></div>
        <Link href="/dashboard/clients" className="platform-button">Client directory</Link>
      </header>
      {rows.length ? <TableScrollArea label="Client AI usage and allocation"><table className="w-full min-w-[1350px] text-left text-sm">
        <thead><tr>{["Client / websites", "Client requests", "Credits charged", "Credits remaining", "Client cost", "Agency work on this account", "Total cost to serve", "Margin", "Current included allocation", "Held requests"].map((heading) => <th key={heading} className="px-5 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const allocation = usageByAccount.get(row.account_id);
          const accountSites = sites?.filter((site) => site.account_id === row.account_id);
          const totalCost = row.cost_usd + row.agency_cost_usd;
          return <tr key={row.account_id} className="align-top">
            <th scope="row" className="px-5 text-left font-medium"><span className="block text-sm text-[var(--platform-ink)]">{row.account_name}</span>
              {accountSites ? accountSites.length ? <ul className="mt-2 space-y-1 text-xs font-normal">{accountSites.map((site) => <li key={site.id}><Link href={`/dashboard/sites/${site.id}`} className="text-[var(--platform-muted)] hover:underline">{site.name || site.subdomain}</Link></li>)}</ul>
                : <span className="mt-2 block text-xs font-normal text-[var(--platform-muted)]">No websites assigned</span>
                : <span className="mt-2 block text-xs font-normal text-[var(--platform-error)]">Website list unavailable</span>}
            </th>
            <td className="px-5 tabular-nums">{row.requests.toLocaleString("en")}</td>
            <td className="px-5 tabular-nums">{row.credits_charged.toLocaleString("en")}</td>
            <td className="px-5 tabular-nums">{allocation ? allocation.extra_credits.toLocaleString("en") : "Unavailable"}</td>
            <td className="px-5 tabular-nums">{formatAiCost(row.cost_usd, true)}</td>
            <td className="px-5 tabular-nums">{formatAiCost(row.agency_cost_usd, true)}</td>
            <td className="px-5 font-medium tabular-nums">{formatAiCost(totalCost, true)}</td>
            <td className="px-5 tabular-nums">{formatAiCost(row.credits_charged * 0.05 - totalCost, true)}</td>
            <td className="px-5">{allocation ? <div className="min-w-48 space-y-3">
              <Allocation label="Sites" used={allocation.included_generations} limit={allocation.monthly_site_generations} />
              <Allocation label="Edits" used={allocation.included_edits} limit={allocation.monthly_edits} />
            </div> : <span className="text-xs text-[var(--platform-muted)]">{usage ? "No allowance configured" : "Unavailable"}</span>}</td>
            <td className="px-5 text-xs">{allocation ? `${allocation.pending_requests} held / awaiting reconciliation` : "Unavailable"}</td>
          </tr>;
        })}</tbody>
      </table></TableScrollArea> : <div className="px-6 py-10 text-center"><Users size={24} className="mx-auto text-[var(--platform-muted)]" /><h3 className="mt-3 text-sm font-semibold">No client accounts yet</h3></div>}
      <p className="border-t border-[var(--platform-line)] px-5 py-4 text-xs leading-relaxed text-[var(--platform-muted)]">Margin is completed credits charged × $0.05 minus total cost to serve, not revenue or profit. Included usage has no credit charge. Current extra credits and allocations are not historical snapshots; allocations include held reservations.</p>
    </section>
  </>;
}

function SpendChart({ report, month }: { report: MonthlyAiReport; month: string }) {
  const amounts = new Map(report.daily.map((day) => [day.day, day]));
  const days = reportingDays(month).map((day) => amounts.get(day) ?? { day, clients: 0, agency: 0, evals: 0 });
  const max = Math.max(0, ...days.map((day) => day.clients + day.agency + day.evals));
  const colors = ["var(--platform-accent)", "var(--platform-secondary)", "var(--platform-muted)"];
  return <section className="platform-panel p-5"><h2 className="text-[15px] font-semibold">Daily spend</h2>
    <p className="mt-1 text-xs text-[var(--platform-muted)]">America/Chicago dates; first and last days are partial billing days.</p>
    <div className="mt-4 flex flex-wrap gap-4 text-xs">{["Clients", "Agency", "Evals"].map((label, index) => <span key={label} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: colors[index] }} />{label}</span>)}</div>
    {max > 0 ? <svg viewBox={`0 0 ${days.length * 18} 150`} role="img" aria-label="Daily AI spending stacked by clients, agency and evals" className="mt-4 h-48 w-full" preserveAspectRatio="none">
      {days.map((day, index) => {
        let y = 145;
        return <g key={day.day}>{[day.clients, day.agency, day.evals].map((value, part) => {
          const height = value / max * 140;
          y -= height;
          return <rect key={part} x={index * 18 + 2} y={y} width="12" height={height} fill={colors[part]} />;
        })}</g>;
      })}
    </svg> : <p className="py-8 text-center text-xs text-[var(--platform-muted)]">No recorded spending in this period.</p>}
    <div className="flex justify-between gap-3 text-xs text-[var(--platform-muted)]"><span>{days[0]?.day}</span><span>{days.at(-1)?.day}</span></div>
    <details className="mt-3"><summary className="w-fit text-xs font-medium">View daily values</summary>
      <TableScrollArea label="Daily AI spending" className="mt-3 max-h-64"><table className="w-full text-left text-xs">
        <thead><tr><th>Chicago date</th><th>Clients</th><th>Agency</th><th>Evals</th></tr></thead>
        <tbody>{days.map((day) => <tr key={day.day}><td>{day.day}</td><td>{formatAiCost(day.clients, true)}</td><td>{formatAiCost(day.agency, true)}</td><td>{formatAiCost(day.evals, true)}</td></tr>)}</tbody>
      </table></TableScrollArea>
    </details>
  </section>;
}

function Allocation({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? used / limit * 100 : null;
  return <div><div className="flex justify-between gap-4 text-xs"><span className="text-[var(--platform-muted)]">{label}: {used} / {limit}</span><span className="font-medium tabular-nums">{percent === null ? "No included allowance" : `${Math.round(percent)}%`}</span></div>
    {percent !== null ? <div role="meter" aria-label={`${label} included allocation`} aria-valuenow={Math.min(used, limit)} aria-valuemin={0} aria-valuemax={limit} aria-valuetext={`${used} of ${limit} included; may include held reservations`} className="mt-1.5 h-1 rounded-full bg-[var(--platform-ground)]">
      <div className="h-full rounded-full bg-[var(--platform-accent)]" style={{ width: `${Math.min(100, percent)}%` }} />
    </div> : null}
  </div>;
}
