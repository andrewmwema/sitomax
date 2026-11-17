import { Suspense } from "react";
import { requireSuperAdmin } from "@/lib/auth";
import { getMonthlyAiCosts, monthSchema } from "@/lib/ai/reporting";

export default function AiCostsPage({ searchParams }: {
  searchParams: Promise<{ month?: string }>;
}) {
  return <Suspense fallback={<p role="status">Loading AI costs...</p>}><MonthlyCosts searchParams={searchParams} /></Suspense>;
}

async function MonthlyCosts({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const parsed = monthSchema.safeParse(params.month ?? new Date().toISOString().slice(0, 7));
  if (!parsed.success) return <p role="alert">Choose a valid month using YYYY-MM.</p>;
  const rows = await getMonthlyAiCosts(parsed.data);
  const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return <section className="flex flex-col gap-6">
    <header><h1 className="text-2xl font-semibold">AI cost by client</h1>
      <p className="mt-1 text-sm text-zinc-600">Monthly estimates from the configured token rates, in USD. Calendar months use UTC.</p></header>
    <form className="flex items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">Month<input type="month" name="month" defaultValue={parsed.data} required className="rounded-lg border bg-white p-2" /></label>
      <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">View</button>
    </form>
    <p className="font-medium">Total: {money(rows.reduce((total, row) => total + row.cost_usd, 0))}</p>
    <p className="text-xs text-zinc-500">Recorded requests only. Pending reservations and accounting failures are excluded until reconciled; check the AI usage cards on Sites for held requests.</p>
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">AI costs per client for {parsed.data}</caption>
        <thead><tr className="border-b"><th className="p-4">Client</th><th className="p-4">Requests</th><th className="p-4">Estimated cost (USD)</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.account_id} className="border-b last:border-0"><th scope="row" className="p-4 font-medium">{row.account_name}</th><td className="p-4">{row.requests}</td><td className="p-4 tabular-nums">{money(row.cost_usd)}</td></tr>)}</tbody>
      </table>
      {!rows.length ? <p className="p-4 text-sm text-zinc-500">No client accounts yet.</p> : null}
    </div>
  </section>;
}
