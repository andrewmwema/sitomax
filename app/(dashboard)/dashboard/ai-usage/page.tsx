import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { getAiUsageSummaries, getMonthlyAiCosts, monthSchema } from "@/lib/ai/reporting";
import { AiCostReport, type AiCostSite } from "@/components/dashboard/ai-cost-report";

export default function AiCostsPage({ searchParams }: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  return <section className="flex flex-col gap-6">
    <header><p className="platform-eyebrow mb-1">Management</p><h1 className="text-2xl font-semibold tracking-tight">AI Usage &amp; Costs</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Monitor AI usage, estimated spending, and client allocation.</p></header>
    <Suspense fallback={<div role="status" aria-label="Loading AI costs" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}><MonthlyCosts searchParams={searchParams} /></Suspense>
  </section>;
}

async function MonthlyCosts({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const { supabase } = await requireSuperAdmin();
  const params = await searchParams;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const parsed = monthSchema.safeParse(params.month ?? currentMonth);
  if (!parsed.success) return <p role="alert">Choose a valid month using YYYY-MM.</p>;
  const [rows, usage, sites] = await Promise.all([
    getMonthlyAiCosts(parsed.data),
    getAiUsageSummaries().catch((error: unknown) => {
      unstable_rethrow(error);
      console.error("Could not load current AI allowances and reservations.");
      return null;
    }),
    (async () => {
      const sites: AiCostSite[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from("sites").select("id, account_id, name, subdomain").order("id").range(from, from + 499);
        if (error) {
          console.error("Could not load websites for AI cost reporting.");
          return null;
        }
        sites.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) return sites;
      }
    })(),
  ]);
  return <>
    <form key={parsed.data} action="/dashboard/ai-usage" className="platform-panel flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1.5 text-xs text-[var(--platform-muted)]">Reporting month<input type="month" name="month" defaultValue={parsed.data} required className="border px-3 text-sm" /></label>
      <button type="submit" className="platform-button platform-button-primary">View report</button>
      <p className="py-3 text-xs text-[var(--platform-muted)]">Calendar month · UTC · estimates in USD</p>
    </form>
    <AiCostReport rows={rows} usage={usage} sites={sites} month={parsed.data} currentMonth={currentMonth} />
  </>;
}
