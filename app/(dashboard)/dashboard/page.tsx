import { Suspense } from "react";
import Link from "next/link";
import { z } from "zod";
import { ArrowRight, ArrowUpRight, BarChart3, CircleDollarSign, Globe2, Inbox, Plus, Sparkles, UserPlus } from "lucide-react";
import { getMonthlyAiCosts } from "@/lib/ai/reporting";
import { getDashboardSites } from "@/lib/dashboard/sites";
import { getSiteUrl } from "@/lib/site-url";
import { AiUsageCards } from "@/components/dashboard/ai-usage-cards";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { VisitsChart } from "@/components/dashboard/analytics-report";

const analyticsSchema = z.object({
  visits: z.number(),
  daily: z.array(z.object({ day: z.string(), visits: z.number() })),
});

type Lead = {
  id: string;
  data: unknown;
  is_read: boolean;
  created_at: string;
  site: { name: string | null; subdomain: string } | null;
};

type Activity = { id: string; label: string; detail: string; date: string; href: string };

export default function DashboardPage() {
  return <Suspense fallback={<div role="status" aria-label="Loading overview" className="h-72 animate-pulse rounded-2xl bg-[#EFEEEA]" />}><Overview /></Suspense>;
}

async function Overview() {
  const { supabase, profile, sites, isAdmin, canSeeReporting, ownerSite } = await getDashboardSites();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const viewsSince = new Date(now.getTime() - 30 * 86400000).toISOString();
  const leadsSince = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [
    clientsResult, leadsResult, newLeadsResult, viewsResult, analyticsResult, costResult, domainRequestsResult,
  ] = await Promise.all([
    isAdmin ? supabase.from("accounts").select("id", { count: "exact", head: true }).eq("is_internal", false) : null,
    canSeeReporting ? supabase.from("form_submissions").select("id, data, is_read, created_at, site:sites(name, subdomain)").order("created_at", { ascending: false }).limit(5) : null,
    canSeeReporting ? supabase.from("form_submissions").select("id", { count: "exact", head: true }).gte("created_at", leadsSince) : null,
    canSeeReporting ? supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", viewsSince) : null,
    canSeeReporting && ownerSite ? supabase.rpc("site_analytics", { p_site_id: ownerSite.id, p_days: 30 }) : null,
    isAdmin ? getMonthlyAiCosts(month).then((rows) => ({ total: rows.reduce((sum, row) => sum + row.cost_usd, 0), error: false })).catch((error: unknown) => {
      console.error("Could not load AI cost summary", error);
      return { total: 0, error: true };
    }) : null,
    isAdmin ? supabase.from("domain_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "in_progress", "needs_info"]) : null,
  ]);
  const displayName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const liveSites = sites.filter((site) => site.pages.some((page) => page.slug === "" && page.published_at)).length;
  const draftSites = sites.filter((site) => !site.pages.some((page) => page.slug === "" && page.published_at));
  const domainIssues = sites.filter((site) => site.canManageDomains && site.custom_domain && !site.domain_verified);
  const metrics = [
    { label: "Live websites", value: String(liveSites), detail: `of ${sites.length} websites`, href: "/dashboard/sites?status=live", icon: Globe2 },
    ...(isAdmin ? [{ label: "Total clients", value: clientsResult?.error ? "Unavailable" : (clientsResult?.count ?? 0).toLocaleString(), detail: "client accounts", href: "/dashboard/clients", icon: UserPlus }] : []),
    { label: "Website visits · 30 days", value: !canSeeReporting ? "—" : viewsResult?.error ? "Unavailable" : (viewsResult?.count ?? 0).toLocaleString(), detail: canSeeReporting ? "across your sites" : "available to account owners", href: "/dashboard/analytics", icon: BarChart3 },
    { label: "New leads · 7 days", value: !canSeeReporting ? "—" : newLeadsResult?.error ? "Unavailable" : (newLeadsResult?.count ?? 0).toLocaleString(), detail: "form submissions", href: "/dashboard/forms", icon: Inbox },
    ...(isAdmin ? [{ label: "AI spending · this month", value: costResult?.error ? "Unavailable" : `$${(costResult?.total ?? 0).toFixed(2)}`, detail: "estimated client usage", href: "/dashboard/ai-usage", icon: CircleDollarSign }] : []),
  ];
  const parsedAnalytics = analyticsResult && !analyticsResult.error ? analyticsSchema.safeParse(analyticsResult.data) : null;
  const analyticsError = analyticsResult?.error || (parsedAnalytics && !parsedAnalytics.success);
  const analytics = parsedAnalytics?.success ? parsedAnalytics.data : null;
  const leads = (leadsResult?.data ?? []) as unknown as Lead[];
  const activities: Activity[] = [
    ...leads.map((lead) => {
      const fields = lead.data && typeof lead.data === "object" ? lead.data as Record<string, unknown> : {};
      const name = typeof fields.name === "string" ? fields.name : "New form submission";
      return { id: `lead-${lead.id}`, label: "New submission", detail: `${name} · ${lead.site?.name || lead.site?.subdomain || "Website"}`, date: lead.created_at, href: "/dashboard/forms" };
    }),
    ...sites.slice(0, 5).map((site) => ({
      id: `site-${site.id}`, label: "Website added", detail: site.name || site.subdomain,
      date: site.createdAt ?? "", href: `/dashboard/sites/${site.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const aiHref = isAdmin ? "/dashboard/sites/new/ai" : ownerSite ? `/dashboard/sites/${ownerSite.id}/generate` : null;

  return <div className="flex flex-col gap-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <DashboardGreeting displayName={displayName} />
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/sites/new" className="platform-button platform-button-primary"><Plus size={15} />New site</Link>
        {isAdmin ? <Link href="/dashboard/clients" className="platform-button"><UserPlus size={15} />Add client</Link> : null}
      </div>
    </header>

    <section aria-label="Workspace metrics" className={`grid gap-3 sm:grid-cols-2 ${isAdmin ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
      {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="platform-panel platform-metric block min-w-0 p-4 hover:border-[#D5D3CD]">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-[#6B6A66]">{metric.label}</p><metric.icon size={16} strokeWidth={1.5} className="shrink-0 text-[#9A978E]" /></div>
        <p className="mt-3 truncate text-[27px] leading-tight font-semibold tracking-[-0.8px] tabular-nums">{metric.value}</p>
        <p className="mt-1 text-[11px] text-[#6B6A66]">{metric.detail}</p>
      </Link>)}
    </section>

    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
      <PerformanceSnapshot
        siteName={ownerSite?.name || ownerSite?.subdomain || null}
        siteId={ownerSite?.id ?? null}
        canSeeReporting={canSeeReporting}
        analytics={analytics}
        error={Boolean(analyticsError)}
      />
      <ActionCenter
        isAdmin={isAdmin}
        draftSites={draftSites}
        domainIssues={domainIssues}
        pendingDomainRequests={domainRequestsResult?.count ?? 0}
        domainRequestsError={Boolean(domainRequestsResult?.error)}
      />
    </section>

    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
      <RecentActivity activities={activities} canSeeReporting={canSeeReporting} leadsError={Boolean(leadsResult?.error)} />
      <div className="flex flex-col gap-5">
        {aiHref ? <section className="platform-studio p-5 text-white">
          <div className="flex items-center gap-3"><span className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-[#C9C3FF]"><Sparkles size={18} strokeWidth={1.5} /></span><div><p className="text-[10px] font-medium tracking-[0.15em] text-[#C9C3FF] uppercase">Create with intention</p><h2 className="mt-0.5 text-lg font-medium">AI Studio</h2></div></div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#C2BFCB]">Create a new draft website from your business details.</p>
          <Link href={aiHref} className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-xs font-semibold text-[#121212] hover:bg-[#F1EFFF]">Build with AI<ArrowUpRight size={14} /></Link>
        </section> : null}
        <QuickActions isAdmin={isAdmin} />
        <Suspense fallback={<p className="text-sm text-[#6B6A66]">Loading AI usage...</p>}><AiUsageCards isSuperAdmin={isAdmin} /></Suspense>
      </div>
    </section>

    <SitesAtGlance sites={sites.slice(0, 4)} />
  </div>;
}

function PerformanceSnapshot({
  siteName, siteId, canSeeReporting, analytics, error,
}: {
  siteName: string | null;
  siteId: string | null;
  canSeeReporting: boolean;
  analytics: z.infer<typeof analyticsSchema> | null;
  error: boolean;
}) {
  return <section className="platform-panel overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFEEEA] px-5 py-4">
      <div><h2 className="text-[15px] font-semibold">Performance snapshot</h2><p className="mt-1 text-xs text-[#6B6A66]">{siteName ? `Daily visits · ${siteName} · last 30 days (UTC)` : "Website traffic over the last 30 days"}</p></div>
      {siteId && canSeeReporting ? <Link href={`/dashboard/analytics?site=${encodeURIComponent(siteId)}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#55534E] hover:text-[#121212]">Analytics<ArrowUpRight size={13} /></Link> : null}
    </div>
    {!canSeeReporting ? <p className="px-5 py-10 text-center text-sm text-[#6B6A66]">Traffic reporting is available to account owners.</p> :
      error ? <p role="alert" className="px-5 py-10 text-center text-sm text-red-700">Could not load the traffic snapshot. Open Analytics to retry.</p> :
        !analytics ? <div className="px-5 py-10 text-center"><BarChart3 size={22} className="mx-auto text-[#A6A39C]" /><p className="mt-3 text-sm font-medium">No visits recorded yet</p><p className="mt-1 text-xs text-[#6B6A66]">Visits will appear after analytics is enabled on a published website.</p></div> :
          <>{analytics.visits > 0 ? <div className="flex items-baseline gap-2 px-5 pt-5"><strong className="text-2xl tabular-nums">{analytics.visits.toLocaleString()}</strong><span className="text-xs text-[#6B6A66]">visits on this site</span></div> : null}
            <VisitsChart daily={analytics.daily} visits={analytics.visits} />
          </>}
  </section>;
}

function ActionCenter({
  isAdmin, draftSites, domainIssues, pendingDomainRequests, domainRequestsError,
}: {
  isAdmin: boolean;
  draftSites: { id: string; name: string | null; subdomain: string; canManageDomains: boolean }[];
  domainIssues: { id: string; name: string | null; subdomain: string; canManageDomains: boolean }[];
  pendingDomainRequests: number;
  domainRequestsError: boolean;
}) {
  const actions = [
    ...(draftSites.length ? [{ key: "drafts", title: `${draftSites.length} draft ${draftSites.length === 1 ? "website" : "websites"} to review`, detail: "Finish editing or publish when ready.", href: "/dashboard/sites?status=draft" }] : []),
    ...domainIssues.slice(0, 2).map((site) => ({ key: `domain-${site.id}`, title: `${site.name || site.subdomain}: domain verification`, detail: "Check the DNS setup to bring this domain online.", href: `/dashboard/sites/${site.id}/domains` })),
    ...(isAdmin && pendingDomainRequests ? [{ key: "requests", title: `${pendingDomainRequests} domain ${pendingDomainRequests === 1 ? "request" : "requests"} need attention`, detail: "Review open client domain requests.", href: "/dashboard/domain-requests" }] : []),
  ];
  return <section className="platform-panel p-5">
    <div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold">Action center</h2><p className="mt-1 text-xs text-[#6B6A66]">Items that may need your attention.</p></div><span className="rounded-full bg-[#F1F0EC] px-2.5 py-1 text-[11px] font-medium tabular-nums">{actions.length}</span></div>
    {domainRequestsError ? <p role="alert" className="mt-4 text-sm text-red-700">Could not load domain requests.</p> : null}
    {actions.length ? <ul className="mt-3 divide-y divide-[#EFEEEA]">{actions.map((action) => <li key={action.key}>
      <Link href={action.href} className="flex items-start justify-between gap-3 py-3 hover:text-[#4B3FE0]"><span><span className="block text-sm font-medium">{action.title}</span><span className="mt-1 block text-xs text-[#6B6A66]">{action.detail}</span></span><ArrowRight size={15} className="mt-1 shrink-0" /></Link>
    </li>)}</ul> : domainRequestsError ? null : <div className="py-9 text-center"><span className="mx-auto flex size-9 items-center justify-center rounded-full bg-[#EEF6F0] text-[#0F7246]">✓</span><p className="mt-3 text-sm font-medium">You&apos;re all caught up</p><p className="mt-1 text-xs text-[#6B6A66]">We&apos;ll surface drafts and domain issues here.</p></div>}
  </section>;
}

function RecentActivity({ activities, canSeeReporting, leadsError }: { activities: Activity[]; canSeeReporting: boolean; leadsError: boolean }) {
  return <section className="platform-panel overflow-hidden">
    <div className="flex items-center justify-between border-b border-[#EFEEEA] px-5 py-4"><div><h2 className="text-[15px] font-semibold">Recent activity</h2><p className="mt-1 text-xs text-[#6B6A66]">Website creation and form submissions.</p></div><Link href="/dashboard/forms" className="inline-flex items-center gap-1 text-xs font-medium text-[#55534E] hover:text-[#121212]">Submissions<ArrowUpRight size={13} /></Link></div>
    {leadsError ? <p role="alert" className="p-5 text-sm text-red-700">Could not load recent submissions.</p> :
      activities.length ? <ul className="divide-y divide-[#F1F0EC] px-5">{activities.map((item) => <li key={item.id}>
        <Link href={item.href} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-xs text-[#6B6A66]">{item.label}</span><span className="mt-0.5 block truncate text-sm font-medium">{item.detail}</span></span><time dateTime={item.date} className="shrink-0 text-[11px] text-[#77756F]">{new Date(item.date).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric" })}</time></Link>
      </li>)}</ul> : <p className="p-6 text-sm text-[#6B6A66]">{canSeeReporting ? "No recent website activity yet." : "Recent activity is available to account owners."}</p>}
  </section>;
}

function QuickActions({ isAdmin }: { isAdmin: boolean }) {
  return <section className="platform-panel p-5">
    <h2 className="text-[15px] font-semibold">Quick actions</h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <Link href="/dashboard/sites/new" className="platform-button justify-start"><Plus size={14} />Create website</Link>
      {isAdmin ? <Link href="/dashboard/clients" className="platform-button justify-start"><UserPlus size={14} />Add client</Link> : null}
      <Link href="/dashboard/forms" className="platform-button justify-start"><Inbox size={14} />View submissions</Link>
      <Link href={isAdmin ? "/dashboard/domain-requests" : "/dashboard/sites"} className="platform-button justify-start"><Globe2 size={14} />Manage domains</Link>
    </div>
  </section>;
}

function SitesAtGlance({ sites }: { sites: Awaited<ReturnType<typeof getDashboardSites>>["sites"] }) {
  return <section className="platform-panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEEEA] px-5 py-4">
      <div><h2 className="text-[15px] font-semibold">Sites at a glance</h2><p className="mt-1 text-xs text-[#6B6A66]">Recently added websites in your workspace.</p></div>
      <Link href="/dashboard/sites" className="inline-flex items-center gap-1 text-xs font-medium text-[#55534E] hover:text-[#121212]">View all sites<ArrowUpRight size={13} /></Link>
    </div>
    {sites.length ? <ul className="divide-y divide-[#F1F0EC] px-5">{sites.map((site) => {
      const live = Boolean(site.pages.find((page) => page.slug === "")?.published_at);
      const url = getSiteUrl(site);
      return <li key={site.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="flex min-w-0 items-center gap-3"><span className={`size-2 shrink-0 rounded-full ${live ? "bg-emerald-600" : "bg-[#A8A7A2]"}`} aria-hidden="true" /><div className="min-w-0">
          <Link href={`/dashboard/sites/${site.id}`} className="block truncate text-sm font-medium hover:underline">{site.name || site.subdomain}</Link>
          <span className="block truncate text-xs text-[#6B6A66]">{site.accountName ? `${site.accountName} · ` : ""}{url.replace(/^https?:\/\//, "")}</span>
        </div></div>
        <div className="flex items-center gap-3"><span className="text-xs text-[#6B6A66]">{live ? "Live" : "Draft"}</span><Link href={`/dashboard/sites/${site.id}`} className="text-xs font-medium hover:underline">Manage</Link></div>
      </li>;
    })}</ul> : <div className="p-7 text-center"><p className="text-sm font-medium">No websites yet</p><p className="mt-1 text-xs text-[#6B6A66]">Create your first website to get started.</p><Link href="/dashboard/sites/new" className="platform-button platform-button-primary mt-4"><Plus size={14} />Create website</Link></div>}
  </section>;
}
