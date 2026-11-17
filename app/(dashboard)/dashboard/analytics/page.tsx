import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const reportSchema = z.object({
  visits: z.number(), unique_visitors: z.number(), form_submissions: z.number(),
  daily: z.array(z.object({ day: z.string(), visits: z.number() })),
  pages: z.array(z.object({ label: z.string(), count: z.number() })),
  referrers: z.array(z.object({ label: z.string(), count: z.number() })),
  devices: z.array(z.object({ label: z.string(), count: z.number() })),
});

export default function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  return <Suspense fallback={<p role="status">Loading analytics...</p>}><AnalyticsContent searchParams={searchParams} /></Suspense>;
}

async function AnalyticsContent({ searchParams }: { searchParams: PageProps<"/dashboard/analytics">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const [{ data: sites, error: sitesError }, { data: memberships, error: membershipsError }, { data: admin, error: adminError }] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain").order("name"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesError || membershipsError || adminError) throw new Error("Could not load analytics sites.");
  const allowedSites = (sites ?? []).filter((site) => admin || memberships?.some((member) => member.account_id === site.account_id));
  const siteParam = typeof params.site === "string" ? params.site : undefined;
  const daysParam = typeof params.days === "string" ? params.days : "30";
  if (!["7", "30", "90"].includes(daysParam)) return <p role="alert">Choose a valid date range.</p>;
  const selected = siteParam ? allowedSites.find((site) => site.id === siteParam) : allowedSites[0];
  if (siteParam && !selected) return <p role="alert">This site is unavailable or you do not have permission to view its analytics.</p>;
  if (!selected) return <section><h1 className="text-2xl font-semibold">Analytics</h1><p className="mt-4 text-sm text-zinc-600">Analytics is available to account owners for their sites.</p></section>;
  const { data, error } = await supabase.rpc("site_analytics", { p_site_id: selected.id, p_days: Number(daysParam) });
  if (error) return <p role="alert">Could not load analytics. Please retry or ask your agency to apply the analytics migration.</p>;
  const parsed = reportSchema.safeParse(data);
  if (!parsed.success) throw new Error("Analytics returned an invalid report.");
  const report = parsed.data;
  return <section className="flex flex-col gap-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-[#6B6A66]">Traffic and submissions by site. Dates use UTC.</p></header>
    <form className="platform-panel flex flex-wrap items-end gap-3 p-5">
      <label className="flex flex-col gap-1 text-sm">Site<select name="site" defaultValue={selected.id} className="rounded-lg border border-[#E8E7E3] bg-white p-2.5">
        {allowedSites.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">Date range<select name="days" defaultValue={daysParam} className="rounded-lg border border-[#E8E7E3] bg-white p-2.5">
        {[7, 30, 90].map((days) => <option key={days} value={days}>Last {days} days</option>)}</select></label>
      <button className="platform-button platform-button-primary">View</button>
    </form>
    <div className="platform-metrics">
      {[["Visits", report.visits], ["Unique visitors (daily)", report.unique_visitors], ["Form submissions", report.form_submissions]].map(([label, count]) =>
        <div key={label} className="platform-panel platform-metric"><p className="text-xs font-medium text-[#6B6A66]">{label}</p><p className="mt-4 text-[32px] font-semibold tracking-tight tabular-nums">{Number(count).toLocaleString()}</p></div>)}
    </div>
    <p className="text-xs text-[#6B6A66]">Visitor identifiers change daily, so a returning visitor can be counted once on each day.</p>
    <section className="platform-panel p-6">
      <h2 className="font-semibold">Visits per day</h2>
      <VisitsChart daily={report.daily} />
    </section>
    <div className="grid gap-4 lg:grid-cols-3">
      <Breakdown title="Top pages" rows={report.pages} />
      <Breakdown title="Top referrers" rows={report.referrers} />
      <Breakdown title="Devices" rows={report.devices} />
    </div>
  </section>;
}

function VisitsChart({ daily }: { daily: { day: string; visits: number }[] }) {
  const max = Math.max(0, ...daily.map((day) => day.visits));
  const points = daily.map((day, index) => `${20 + index * 560 / Math.max(1, daily.length - 1)},${150 - day.visits * 130 / Math.max(1, max)}`).join(" ");
  return <>
    <svg viewBox="0 0 600 170" role="img" aria-label={`Daily visits from ${daily[0]?.day} to ${daily[daily.length - 1]?.day}. Maximum ${max} visits per day.`} className="mt-4 h-48 w-full" preserveAspectRatio="none">
      <path d="M20 20V150H580" fill="none" stroke="#E8E7E3" />
      <polyline points={points} fill="none" stroke="#55534E" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="flex justify-between text-xs text-[#6B6A66]"><span>{daily[0]?.day}</span><span>{daily[daily.length - 1]?.day}</span></div>
    <details className="mt-3 text-xs text-[#6B6A66]"><summary className="cursor-pointer">Daily values</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-3">{daily.map((day) => <li key={day.day}>{day.day}: {day.visits.toLocaleString()}</li>)}</ul></details>
  </>;
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return <section className="platform-panel p-6"><h2 className="font-semibold">{title}</h2>
    {rows.length ? <ul className="mt-3 divide-y divide-[#E8E7E3] text-sm">{rows.map((row) =>
      <li key={row.label} className="flex justify-between gap-4 py-2"><span className="break-all">{row.label}</span><span className="tabular-nums">{row.count.toLocaleString()}</span></li>)}</ul>
      : <p className="mt-3 text-sm text-[#6B6A66]">No data yet.</p>}</section>;
}
