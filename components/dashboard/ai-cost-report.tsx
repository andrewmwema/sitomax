import Link from "next/link";
import { Activity, CircleDollarSign, Clock3, Info, Sparkles, Users } from "lucide-react";
import type { AiUsageSummary, MonthlyAiCost } from "@/lib/ai/reporting";
import { formatAiCost } from "@/lib/ai/cost-format";
import { WorkspaceMetrics } from "./workspace-metrics";

export type AiCostSite = { id: string; account_id: string; name: string | null; subdomain: string };

export function AiCostReport({ rows, usage, sites, month, currentMonth }: {
  rows: MonthlyAiCost[];
  usage: AiUsageSummary[] | null;
  sites: AiCostSite[] | null;
  month: string;
  currentMonth: string;
}) {
  const spend = rows.reduce((total, row) => total + row.cost_usd, 0);
  const requests = rows.reduce((total, row) => total + row.requests, 0);
  const active = rows.filter((row) => row.requests > 0).length;
  const pending = usage?.reduce((total, row) => total + row.pending_requests, 0);
  const usageByAccount = new Map(usage?.map((row) => [row.account_id, row]));
  const topClients = [...rows].filter((row) => row.cost_usd > 0).sort((a, b) => b.cost_usd - a.cost_usd).slice(0, 5);
  const largest = topClients[0]?.cost_usd ?? 0;
  return <>
    <WorkspaceMetrics metrics={[
      { label: "Estimated spend", value: formatAiCost(spend), detail: `${month} · recorded client usage`, icon: CircleDollarSign },
      { label: "Recorded API requests", value: requests, detail: "Requests with recorded token usage", icon: Activity },
      { label: "Active AI clients", value: active, detail: "Clients with recorded requests", icon: Users },
      { label: "Average cost / request", value: formatAiCost(requests ? spend / requests : 0), detail: "Estimated · selected UTC month", icon: Sparkles },
    ]} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)]">
      <section className="platform-panel p-5"><h2 className="text-[15px] font-semibold">Spending by client</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Top five clients by estimated cost · {month}</p>
        {topClients.length ? <ul className="mt-5 space-y-4">{topClients.map((row) => <li key={row.account_id}>
          <div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{row.account_name}</span><span className="shrink-0 tabular-nums">{formatAiCost(row.cost_usd, true)}</span></div>
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--platform-ground)]"><div className="h-full rounded-full bg-[var(--platform-accent)] opacity-70" style={{ width: `${row.cost_usd / largest * 100}%` }} /></div>
        </li>)}</ul> : <div className="py-7 text-center"><Activity size={24} className="mx-auto text-[var(--platform-muted)]" /><h3 className="mt-3 text-sm font-semibold">No estimated spending this month</h3><p className="mt-2 text-xs leading-relaxed text-[var(--platform-muted)]">Recorded client AI usage will appear here. Choose another month to inspect earlier usage.</p></div>}
      </section>
      <div className="flex flex-col gap-5">
        <section className="platform-panel p-5"><div className="flex items-center gap-2"><Clock3 size={16} className="text-[var(--platform-muted)]" /><h2 className="text-sm font-semibold">Held requests right now</h2></div>
          <p className="mt-3 text-[28px] font-semibold tracking-tight tabular-nums">{pending === undefined ? "Unavailable" : pending.toLocaleString("en")}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--platform-muted)]">Current UTC month ({currentMonth}). Pending reservations and requests awaiting accounting reconciliation are not confirmed costs or completed usage.</p>
          {!usage ? <p role="alert" className="mt-3 text-xs text-[var(--platform-error)]">Could not load current allowances and reservations. Please retry.</p> : null}
        </section>
        <section className="rounded-xl border border-[var(--platform-line)] bg-[var(--platform-surface)] p-5">
          <div className="flex items-center gap-2"><Info size={16} className="text-[var(--platform-muted)]" /><h2 className="text-sm font-semibold">Estimates, not billing charges</h2></div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--platform-muted)]">Costs use configured token rates and recorded usage. Pending reservations and accounting failures are excluded until reconciled. A single AI task can make multiple API requests.</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--platform-muted)]">Internal agency usage is excluded from client spending and allowances. Agency requests remain unlimited by client credit quotas.</p>
        </section>
      </div>
    </div>
    <section className="platform-panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--platform-line)] px-5 py-4">
        <div><h2 className="text-[15px] font-semibold">Client usage &amp; allocation</h2><p className="mt-1 text-xs text-[var(--platform-muted)]">Costs and API requests: {month}. Included allocation and reservations: current UTC month ({currentMonth}).</p></div>
        <Link href="/dashboard/clients" className="platform-button">Client directory</Link>
      </header>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
        <caption className="sr-only">Estimated client AI costs for {month} and current month allowances for {currentMonth}</caption>
        <thead><tr>{["Client / websites", "Recorded API requests", "Estimated cost (USD)", "Current included allocation", "Extra credits / held requests"].map((heading) => <th key={heading} className="px-5 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const allocation = usageByAccount.get(row.account_id);
          const accountSites = sites?.filter((site) => site.account_id === row.account_id);
          return <tr key={row.account_id} className="align-top">
            <th scope="row" className="px-5 text-left font-medium"><span className="block text-sm text-[var(--platform-ink)]">{row.account_name}</span>
              {accountSites ? accountSites.length ? <ul className="mt-2 space-y-1 text-xs font-normal">{accountSites.map((site) => <li key={site.id}><Link href={`/dashboard/sites/${site.id}`} className="text-[var(--platform-muted)] hover:underline">{site.name || site.subdomain}</Link></li>)}</ul>
                : <span className="mt-2 block text-xs font-normal text-[var(--platform-muted)]">No websites assigned</span>
                : <span className="mt-2 block text-xs font-normal text-[var(--platform-error)]">Website list unavailable</span>}
            </th>
            <td className="px-5 tabular-nums">{row.requests.toLocaleString("en")}</td>
            <td className="px-5 font-medium tabular-nums">{formatAiCost(row.cost_usd, true)}</td>
            <td className="px-5">{allocation ? <div className="min-w-48 space-y-3">
              <Allocation label="Sites" used={allocation.included_generations} limit={allocation.monthly_site_generations} />
              <Allocation label="Edits" used={allocation.included_edits} limit={allocation.monthly_edits} />
            </div> : <span className="text-xs text-[var(--platform-muted)]">{usage ? "No allowance configured" : "Unavailable"}</span>}</td>
            <td className="px-5 text-xs">{allocation ? <><p className="font-medium tabular-nums">{allocation.extra_credits} extra credits</p><p className="mt-2 text-[var(--platform-muted)]">{allocation.pending_requests} held / awaiting reconciliation</p></> : <span className="text-[var(--platform-muted)]">Not available</span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="px-6 py-10 text-center"><Users size={24} className="mx-auto text-[var(--platform-muted)]" /><h3 className="mt-3 text-sm font-semibold">No client accounts yet</h3><p className="mt-2 text-sm text-[var(--platform-muted)]">Create a client account to start tracking its usage and allocation.</p><Link href="/dashboard/clients" className="platform-button mt-4">Add a client</Link></div>}
      <p className="border-t border-[var(--platform-line)] px-5 py-4 text-xs leading-relaxed text-[var(--platform-muted)]">Included allocation counts include held reservations; they are not completed-task counts. Extra credits never expire: 10 per site generation or 1 per edit after the included allowance. Historical allocation snapshots and confirmed billing charges are not available in this report.</p>
    </section>
  </>;
}

function Allocation({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? used / limit * 100 : null;
  return <div><div className="flex justify-between gap-4 text-xs"><span className="text-[var(--platform-muted)]">{label}: {used} / {limit}</span><span className="font-medium tabular-nums">{percent === null ? "No included allowance" : `${Math.round(percent)}%`}</span></div>
    {percent !== null ? <div role="meter" aria-label={`${label} included allocation`} aria-valuenow={Math.min(used, limit)} aria-valuemin={0} aria-valuemax={limit} aria-valuetext={`${used} of ${limit} included; may include held reservations`} className="mt-1.5 h-1 rounded-full bg-[var(--platform-ground)]">
      <div className="h-full rounded-full bg-[var(--platform-accent)]" style={{ width: `${Math.min(100, percent)}%` }} />
    </div> : null}
  </div>;
}
