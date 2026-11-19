import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Download, Globe2, Inbox, MailOpen, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { WorkspaceMetrics } from "@/components/dashboard/workspace-metrics";
import { SubmissionDetails } from "@/components/dashboard/submission-details";
import { MarkSubmissionRead } from "@/components/dashboard/mark-submission-read";
import { getSubmissionPage, SUBMISSION_PAGE_SIZE } from "@/lib/forms/queries";
import { submissionContact, submissionFiltersSchema, submissionQueryString } from "@/lib/forms/submissions";
import { TableScrollArea } from "@/components/dashboard/table-scroll-area";

export default function FormsPage({ searchParams }: PageProps<"/dashboard/forms">) {
  return <section className="flex flex-col gap-6">
    <header><p className="platform-eyebrow mb-1">Operations</p><h1 className="text-2xl font-semibold tracking-tight">Forms &amp; Submissions</h1>
      <p className="mt-2 text-sm text-[var(--platform-muted)]">Capture, organize, and manage inquiries from your websites.</p></header>
    <Suspense fallback={<div role="status" aria-label="Loading submissions" className="h-64 animate-pulse rounded-2xl bg-[var(--platform-subtle)]" />}><FormsContent searchParams={searchParams} /></Suspense>
  </section>;
}

async function FormsContent({ searchParams }: { searchParams: PageProps<"/dashboard/forms">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  const parsed = submissionFiltersSchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert" className="text-sm text-[var(--platform-error)]">Choose valid filters and keep searches under 200 characters.</p>;
  const filters = parsed.data;
  const [{ data: sites, error: sitesError }, { data: memberships, error: memberError }, { data: admin, error: adminError }] = await Promise.all([
    supabase.from("sites").select("id, account_id, name, subdomain, form_submissions(count)").order("name"),
    supabase.from("account_members").select("account_id").eq("user_id", user.id).eq("role", "owner"),
    supabase.rpc("is_super_admin"),
  ]);
  if (sitesError || memberError || adminError) throw new Error("Could not load form permissions.");
  const allowed = (sites ?? []).filter((site) => admin || memberships?.some((member) => member.account_id === site.account_id));
  if (filters.site && !allowed.some((site) => site.id === filters.site)) return <p role="alert">This site is unavailable or you do not have permission to view its submissions.</p>;
  if (!allowed.length) return <div className="platform-panel p-8 text-center"><Inbox size={24} className="mx-auto text-[var(--platform-muted)]" />
    <h2 className="mt-3 text-sm font-semibold">Your website inquiries, in one place</h2><p className="mt-2 text-sm text-[var(--platform-muted)]">Submissions are available to account owners for their websites.</p>
    <Link href="/dashboard/sites" className="platform-button mt-4">View websites</Link>
  </div>;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const siteIds = allowed.map((site) => site.id);
  const [results, unread, monthly] = await Promise.all([
    getSubmissionPage(supabase, allowed, filters, now),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).in("site_id", siteIds).eq("is_read", false),
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).in("site_id", siteIds).gte("created_at", monthStart).lt("created_at", nextMonth),
  ]);
  const total = allowed.reduce((sum, site) => sum + (site.form_submissions[0]?.count ?? 0), 0);
  const websitesReceivingLeads = allowed.filter((site) => (site.form_submissions[0]?.count ?? 0) > 0).length;
  const pages = Math.max(1, Math.ceil(results.count / SUBMISSION_PAGE_SIZE));
  return <>
    <WorkspaceMetrics metrics={[
      { label: "Total submissions", value: total, detail: "Across all authorized websites", icon: Inbox },
      { label: "New submissions", value: unread.error ? "Unavailable" : unread.count ?? 0, detail: "Unread across your websites", icon: MailOpen },
      { label: "This month", value: monthly.error ? "Unavailable" : monthly.count ?? 0, detail: "Calendar month · UTC", icon: CalendarDays },
      { label: "Websites receiving leads", value: websitesReceivingLeads, detail: "With at least one submission", icon: Globe2 },
    ]} />
    <section aria-label="Submission directory" className="platform-panel overflow-hidden">
      <form key={submissionQueryString(filters)} action="/dashboard/forms" className="flex flex-wrap items-end gap-3 border-b border-[var(--platform-line)] p-4">
        <label className="relative min-w-48 flex-1"><span className="sr-only">Search submissions</span><Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-[var(--platform-muted)]" />
          <input type="search" name="q" maxLength={200} defaultValue={filters.q} placeholder="Search any submitted answer..." className="w-full border py-2 pl-9 pr-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Website
          <select name="site" defaultValue={filters.site} className="max-w-52 border px-3 text-sm">
            <option value="">All websites</option>{allowed.map((site) => <option key={site.id} value={site.id}>{site.name || site.subdomain}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Date range
          <select name="days" defaultValue={filters.days} className="border px-3 text-sm"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
        <label className="flex flex-col gap-1 text-xs text-[var(--platform-muted)]">Status
          <select name="status" defaultValue={filters.status} className="border px-3 text-sm"><option value="all">All submissions</option><option value="new">New</option><option value="read">Read</option></select></label>
        <button className="platform-button platform-button-primary">Apply filters</button>
        <Link href="/dashboard/forms" className="platform-button">Reset</Link>
        <a href={`/dashboard/forms/export${submissionQueryString(filters)}`} className="platform-button"><Download size={14} />Export CSV</a>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--platform-line)] px-5 py-3 text-xs text-[var(--platform-muted)]">
        <p>{results.count.toLocaleString("en")} matching {results.count === 1 ? "submission" : "submissions"}</p><p>CSV includes all matches, not just this page.</p>
      </div>
      {results.rows.length ? <TableScrollArea label="Form submissions"><table className="w-full min-w-[980px] text-left text-sm">
        <caption className="sr-only">Matching website inquiries and available actions</caption>
        <thead><tr>{["Contact", "Email", "Source website", "Form", "Submitted (UTC)", "Status", "Actions"].map((heading) => <th key={heading} className="px-5 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{results.rows.map((row) => {
          const site = allowed.find((item) => item.id === row.site_id);
          const siteName = site?.name || site?.subdomain || "Website";
          const contact = submissionContact(row.data);
          return <tr key={row.id} className="align-top">
            <td className="px-5 font-medium">{contact.name || "Form submission"}</td>
            <td className="max-w-56 break-words px-5 text-xs text-[var(--platform-secondary)]">{contact.email || "Not provided"}</td>
            <td className="px-5"><Link href={`/dashboard/sites/${row.site_id}`} className="hover:underline">{siteName}</Link></td>
            <td className="px-5 text-xs text-[var(--platform-muted)]">{row.form_name || "Form"}</td>
            <td className="px-5 text-xs text-[var(--platform-muted)]">{new Date(row.created_at).toLocaleString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
            <td className="px-5"><span className="platform-status" data-tone={row.is_read ? undefined : "accent"}>{row.is_read ? "Read" : "New"}</span></td>
            <td className="px-5"><div className="flex flex-col items-start gap-2"><SubmissionDetails submission={row} siteName={siteName} />{!row.is_read ? <MarkSubmissionRead id={row.id} /> : null}</div></td>
          </tr>;
        })}</tbody>
      </table></TableScrollArea> : <div className="px-6 py-10 text-center"><Inbox size={24} className="mx-auto text-[var(--platform-muted)]" />
        <h2 className="mt-3 text-sm font-semibold">{total ? "No submissions match these filters" : "Ready for your next conversation"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--platform-muted)]">{total ? "Try a different search, website, date range or status." : "Add a form to a website in the editor and publish it. New inquiries will appear here, ready to review and export."}</p>
        <Link href={total ? "/dashboard/forms" : "/dashboard/sites"} className="platform-button mt-4">{total ? "Clear filters" : "Manage websites"}</Link>
      </div>}
      {pages > 1 || filters.page > 1 ? <nav aria-label="Submission pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--platform-line)] px-5 py-3">
        {filters.page > 1 ? <Link href={`/dashboard/forms${submissionQueryString(filters, Math.min(filters.page - 1, pages))}`} className="platform-button">Previous</Link> : <span />}
        <span className="text-xs text-[var(--platform-muted)]">Page {filters.page} · {pages} {pages === 1 ? "page" : "pages"} of results</span>
        {filters.page < pages ? <Link href={`/dashboard/forms${submissionQueryString(filters, filters.page + 1)}`} className="platform-button">Next</Link> : <span />}
      </nav> : null}
    </section>
  </>;
}
