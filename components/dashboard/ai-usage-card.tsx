import type { AiUsageSummary } from "@/lib/ai/reporting";

export function AiUsageCard({ usage }: { usage: AiUsageSummary }) {
  return <section aria-label={`AI usage for ${usage.account_name}`} className="rounded-xl border border-zinc-200 bg-white p-5">
    <h3 className="text-sm font-semibold">AI usage</h3>
    <p className="mt-1 text-xs text-zinc-500">This month (UTC) · {usage.account_name}</p>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-zinc-500">Included site generations</dt><dd className="font-medium">{usage.included_generations} / {usage.monthly_site_generations}</dd></div>
      <div><dt className="text-zinc-500">Included edits &amp; rewrites</dt><dd className="font-medium">{usage.included_edits} / {usage.monthly_edits}</dd></div>
      <div><dt className="text-zinc-500">Extra credits remaining</dt><dd className="font-medium">{usage.extra_credits}</dd></div>
    </dl>
    <p className="mt-3 text-xs text-zinc-500">{usage.site_generations} site generations and {usage.edits} edits recorded. {usage.pending_requests > 0 ? `${usage.pending_requests} requests reserved or awaiting reconciliation. ` : ""}Extra credits never expire: 10 per site, 1 per edit after the included quota. Agency requests are unlimited and do not consume client quotas.</p>
  </section>;
}
