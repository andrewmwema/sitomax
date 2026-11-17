import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getAiUsageSummaries, type AiUsageSummary } from "@/lib/ai/reporting";

export async function AiUsageCards({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  let summaries: AiUsageSummary[];
  try { summaries = await getAiUsageSummaries(); }
  catch (error) {
    unstable_rethrow(error);
    console.error("Could not load dashboard AI usage");
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">AI usage is unavailable. Ask your agency to apply the AI usage migration or retry.</p>;
  }
  if (!summaries.length) return null;
  return <section id="ai-usage" className="platform-panel p-6">
    <div className="flex justify-between gap-3"><h2 className="font-semibold">AI usage by client</h2>
      {isSuperAdmin ? <Link href="/dashboard/ai-usage" className="text-xs font-medium text-[#4B3FE0] hover:underline">Details</Link> : null}</div>
    <ul className="mt-4 space-y-4">{summaries.map((usage) => {
      const percent = usage.monthly_edits ? Math.min(100, usage.included_edits / usage.monthly_edits * 100) : 0;
      return <li key={usage.account_id} className="text-xs">
        <div className="flex justify-between gap-2"><span className="font-medium">{usage.account_name}</span><span className="text-right text-[#5F5E5A]">{usage.included_edits} / {usage.monthly_edits} edits · {usage.included_generations} / {usage.monthly_site_generations} sites</span></div>
        <div aria-hidden="true" className="mt-2 h-1 rounded-full bg-[#EFEEEA]"><div className="h-full rounded-full bg-[#6B675F]" style={{ width: `${percent}%` }} /></div>
        <p className="mt-1.5 text-[#6B6A66]">{usage.extra_credits} extra credits{usage.pending_requests ? ` · ${usage.pending_requests} pending or awaiting reconciliation` : ""}</p>
      </li>;
    })}</ul>
    <p className="mt-4 text-xs text-[#6B6A66]">UTC month · Extra credits never expire: 10 per site or 1 per edit after the included quota. Agency requests do not consume client quotas.</p>
  </section>;
}
