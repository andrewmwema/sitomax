import { Suspense } from "react";
import { z } from "zod";
import Link from "next/link";
import { BarChart3, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { analyticsDaysSchema, siteAnalyticsReportSchema } from "@/lib/analytics";
import { AnalyticsReport } from "@/components/dashboard/analytics-report";

export default function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  return <section className="flex flex-col gap-6">
    <header><p className="platform-eyebrow mb-1">Insights</p><h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Understand your website traffic, visitor behavior, and engagement.</p></header>
    <Suspense fallback={<div role="status" aria-label="Loading analytics" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}><AnalyticsContent searchParams={searchParams} /></Suspense>
  </section>;
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
  const filters = z.object({ site: z.uuid().optional(), days: analyticsDaysSchema }).safeParse(params);
  if (!filters.success) return <p role="alert">Choose a valid website and a 7, 30 or 90 day range.</p>;
  const selected = filters.data.site ? allowedSites.find((site) => site.id === filters.data.site) : allowedSites[0];
  if (filters.data.site && !selected) return <p role="alert">This site is unavailable or you do not have permission to view its analytics.</p>;
  if (!selected) return <div className="platform-panel px-6 py-10 text-center"><BarChart3 size={26} className="mx-auto text-[var(--platform-muted)]" />
    <h2 className="mt-3 text-sm font-semibold">Understand what brings visitors to your website</h2><p className="mt-2 text-sm text-[var(--platform-muted)]">Analytics is available to account owners for their websites.</p>
    <Link href="/dashboard/sites" className="platform-button mt-4">View websites</Link>
  </div>;
  const days = Number(filters.data.days);
  const { data, error } = await supabase.rpc("site_analytics", { p_site_id: selected.id, p_days: days });
  if (error) return <p role="alert" className="platform-panel p-5 text-sm text-[var(--platform-error)]">Could not load analytics. Please retry or ask your agency to apply the analytics migration.</p>;
  const parsed = siteAnalyticsReportSchema.safeParse(data);
  if (!parsed.success) throw new Error("Analytics returned an invalid report.");
  return <>
    <form key={`${selected.id}-${days}`} action="/dashboard/analytics" className="platform-panel flex flex-wrap items-end gap-3 p-4">
      <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs text-[var(--platform-muted)]">Website<select name="site" defaultValue={selected.id} className="border px-3 text-sm">
        {allowedSites.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-xs text-[var(--platform-muted)]">Date range<select name="days" defaultValue={days} className="border px-3 text-sm">
        {[7, 30, 90].map((days) => <option key={days} value={days}>Last {days} days</option>)}</select></label>
      <button className="platform-button platform-button-primary">View report</button>
      <span className="inline-flex items-center gap-1.5 py-3 text-xs text-[var(--platform-muted)]"><CalendarDays size={14} />UTC reporting</span>
    </form>
    <AnalyticsReport report={parsed.data} siteId={selected.id} siteName={selected.name || selected.subdomain} days={days} />
  </>;
}
