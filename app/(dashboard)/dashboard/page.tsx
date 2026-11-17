import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, CircleDollarSign, Globe2, Inbox, Plus, Sparkles, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { findUnreplacedPlaceholders } from "@/lib/sections/placeholders";
import { getMonthlyAiCosts } from "@/lib/ai/reporting";
import { SiteGrid } from "@/components/dashboard/site-grid";
import type { SiteCardSite } from "@/components/dashboard/site-card";
import { AiUsageCards } from "@/components/dashboard/ai-usage-cards";

type SiteRow = Omit<SiteCardSite, "accountName" | "placeholderCount" | "pages"> & {
  account_id: string;
  account: { name: string } | null;
  pages: { id: string; slug: string; published_at: string | null; draft_data: unknown }[];
};
type Lead = { id: string; data: unknown; is_read: boolean; created_at: string; site: { name: string | null; subdomain: string } | null };

export default function SitesPage() {
  return <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-[#EFEEEA]" />}><Overview /></Suspense>;
}

async function Overview() {
  const { supabase, user } = await requireUser();
  const [{ data: profile, error: profileError }, { data, error: sitesError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_super_admin").eq("id", user.id).maybeSingle(),
    supabase.from("sites").select("id, account_id, name, subdomain, custom_domain, domain_verified, pages(id, slug, published_at, draft_data), account:accounts(name)").order("created_at"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
  ]);
  if (profileError || sitesError || membershipError) throw new Error("Could not load your dashboard.");
  const isAdmin = Boolean(profile?.is_super_admin);
  const canSeeReporting = isAdmin || Boolean(memberships?.length);
  const sites = (data ?? []) as unknown as SiteRow[];
  const cards: SiteCardSite[] = sites.map((site) => ({
    ...site, accountName: site.account?.name ?? null,
    pages: site.pages.map(({ id, slug, published_at }) => ({ id, slug, published_at })),
    placeholderCount: site.pages.reduce((total, page) => {
      if (!page.draft_data || typeof page.draft_data !== "object") return total;
      const content = (page.draft_data as { content?: unknown }).content;
      return total + (Array.isArray(content) ? findUnreplacedPlaceholders({ content }).length : 0);
    }, 0),
  }));
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const viewsSince = new Date(now.getTime() - 30 * 86400000).toISOString();
  const leadsSince = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [leadsResult, newLeadsResult, viewsResult, costResult] = await Promise.all([
    canSeeReporting ? supabase.from("form_submissions").select("id, data, is_read, created_at, site:sites(name, subdomain)").order("created_at", { ascending: false }).limit(5) : null,
    canSeeReporting ? supabase.from("form_submissions").select("id", { count: "exact", head: true }).gte("created_at", leadsSince) : null,
    canSeeReporting ? supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", viewsSince) : null,
    isAdmin ? getMonthlyAiCosts(month).then((rows) => ({ total: rows.reduce((sum, row) => sum + row.cost_usd, 0), error: false })).catch(() => {
      console.error("Could not load AI cost summary"); return { total: 0, error: true };
    }) : null,
  ]);
  const displayName = profile?.full_name?.trim().split(/\s+/)[0] || "there";
  const hour = now.getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const liveSites = cards.filter((site) => site.pages.some((page) => page.slug === "" && page.published_at)).length;
  const metrics = [
    { label: "Live sites", value: String(liveSites), detail: `of ${cards.length} sites`, icon: Globe2 },
    { label: "Page views · 30 days", value: !canSeeReporting ? "—" : viewsResult?.error ? "Unavailable" : (viewsResult?.count ?? 0).toLocaleString(), icon: BarChart3 },
    { label: "Leads · last 7 days", value: !canSeeReporting ? "—" : newLeadsResult?.error ? "Unavailable" : (newLeadsResult?.count ?? 0).toLocaleString(), icon: Inbox },
    ...(isAdmin ? [{ label: "AI spend · this month", value: costResult?.error ? "Unavailable" : `$${(costResult?.total ?? 0).toFixed(2)}`, detail: "estimated", icon: CircleDollarSign }] : []),
  ];
  const ownerSite = sites.find((site) => memberships?.some((member) => member.account_id === site.account_id));
  const aiHref = isAdmin ? "/dashboard/sites/new/ai" : ownerSite ? `/dashboard/sites/${ownerSite.id}/generate` : null;
  return <div className="flex flex-col gap-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="platform-eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(now)}</p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-[-0.8px]">Good {greeting}, {displayName}</h1>
        <p className="mt-2 text-[13px] text-[#6B6A66]">A clear view of your websites, clients and what&apos;s next.</p></div>
      {isAdmin ? <div className="flex flex-wrap gap-2.5">
        <Link href="/dashboard/clients" className="platform-button"><UserPlus size={15} />Invite client</Link>
        <Link href="/dashboard/sites/new/ai" className="platform-button platform-button-ai"><Sparkles size={15} />Build with AI</Link>
        <Link href="/dashboard/sites/new" className="platform-button platform-button-primary"><Plus size={15} />New site</Link>
      </div> : null}
    </header>
    <section aria-label="At a glance" className="platform-metrics">
      {metrics.map((metric) => <div key={metric.label} className="platform-panel platform-metric">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-[#6B6A66]">{metric.label}</p><metric.icon size={16} strokeWidth={1.5} className="shrink-0 text-[#9A978E]" /></div>
        <p className="mt-4 text-[32px] leading-tight font-semibold tracking-[-1px] tabular-nums">{metric.value}</p>
        {metric.detail ? <p className="mt-1 text-[11px] text-[#6B6A66]">{metric.detail}</p> : null}
      </div>)}
    </section>
    <SiteGrid sites={cards} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      {canSeeReporting ? <section className="platform-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#EFEEEA] px-6 py-5"><div><h2 className="text-[15px] font-semibold">Recent leads</h2><p className="mt-1 text-xs text-[#6B6A66]">The latest conversations from your sites.</p></div><Link href="/dashboard/forms" className="inline-flex items-center gap-1 text-xs font-medium text-[#55534E] hover:text-[#121212]">View all<ArrowUpRight size={13} /></Link></div>
        {leadsResult?.error ? <p role="alert" className="p-5 text-sm text-red-700">Could not load recent leads.</p> :
          leadsResult?.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-[#6B6A66]"><tr><th className="px-5 py-3 font-medium">From</th><th className="px-3 py-3 font-medium">Site</th><th className="px-3 py-3 font-medium">Message</th><th className="px-5 py-3 text-right font-medium">Received</th></tr></thead>
            <tbody>{(leadsResult.data as unknown as Lead[]).map((lead) => {
              const details = lead.data && typeof lead.data === "object" ? lead.data as Record<string, unknown> : {};
              const name = typeof details.name === "string" ? details.name : "Enquiry";
              const message = typeof details.message === "string" ? details.message : "Form submission";
              return <tr key={lead.id} className="border-t border-[#F1F0EC]"><td className="px-5 py-3 font-medium">{!lead.is_read ? <span aria-label="New" className="mr-2 inline-block size-1.5 rounded-full bg-[#4B3FE0]" /> : null}{name}</td>
                <td className="px-3 py-3">{lead.site?.name || lead.site?.subdomain || "Site"}</td><td className="max-w-56 truncate px-3 py-3 text-[#5F5E5A]">{message}</td><td className="px-5 py-3 text-right text-[#6B6A66]">{new Date(lead.created_at).toLocaleDateString("en", { timeZone: "UTC" })}</td></tr>;
            })}</tbody></table></div> : <p className="p-6 text-sm text-[#6B6A66]">No submissions yet. Form submissions will appear here when forms are connected.</p>}
      </section> : <section className="platform-panel p-5 text-sm text-[#6B6A66]">Lead and analytics reporting is available to account owners.</section>}
      <div className="flex flex-col gap-5">
        {aiHref ? <section className="platform-studio p-6 text-white"><div className="flex items-center gap-3"><span className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-[#C9C3FF]"><Sparkles size={18} strokeWidth={1.5} /></span><div><p className="text-[10px] font-medium tracking-[0.15em] text-[#C9C3FF] uppercase">Create with intention</p><h2 className="mt-0.5 text-lg font-medium">AI Studio</h2></div></div>
          <p className="mt-4 text-[13px] leading-relaxed text-[#C2BFCB]">Describe a business and create a draft site using your design library.</p>
          <Link href={aiHref} className="mt-6 inline-flex items-center gap-3 rounded-[10px] bg-white px-4 py-2.5 text-xs font-semibold text-[#121212] transition hover:bg-[#F1EFFF]">Build a draft site<ArrowUpRight size={14} /></Link>
        </section> : null}
        <Suspense fallback={<p className="text-sm text-[#6B6A66]">Loading AI usage...</p>}><AiUsageCards isSuperAdmin={isAdmin} /></Suspense>
      </div>
    </div>
  </div>;
}
