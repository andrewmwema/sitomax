import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { analyticsDaysSchema, blogAnalyticsReportSchema } from "@/lib/analytics";
import { blogAnalyticsHref, blogManagerHref, resolveBlogEditorPage } from "@/lib/blog-navigation";

export default async function BlogAnalyticsPage({ params, searchParams }: PageProps<"/dashboard/sites/[siteId]/blog/analytics">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(siteId).success) notFound();
  const { supabase } = await requireUser();
  const { data: site, error: siteError } = await supabase.from("sites").select("name, subdomain").eq("id", siteId).maybeSingle();
  if (siteError) throw new Error("Could not load this site.", { cause: siteError });
  if (!site) notFound();
  const days = analyticsDaysSchema.safeParse(query.days);
  const [editorPageId, report] = await Promise.all([
    resolveBlogEditorPage(supabase, siteId, query.editorPage),
    supabase.rpc("blog_analytics", { p_site_id: siteId, p_days: days.success ? Number(days.data) : 30 }),
  ]);
  if (report.error?.code === "42501") notFound();
  const parsed = blogAnalyticsReportSchema.safeParse(report.data);
  if (report.error || !parsed.success) {
    console.error("Could not load blog analytics", { code: report.error?.code ?? "invalid_report" });
  }
  return <main className="platform-ui mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={blogManagerHref(siteId, editorPageId)} className="text-sm text-zinc-600 hover:underline">Back to Blog Manager</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Blog Analytics</h1>
        <p className="mt-1 text-sm text-zinc-500">{site.name || site.subdomain}</p>
      </div>
      {editorPageId ? <a href={`/editor/${editorPageId}`} target="_blank" rel="noopener noreferrer" className="platform-button">Back to editor</a> : null}
    </header>
    <nav aria-label="Reporting period" className="my-6 flex flex-wrap gap-2">
      {analyticsDaysSchema.unwrap().options.map((range) => <Link key={range} href={blogAnalyticsHref(siteId, editorPageId, range)}
        aria-current={days.success && days.data === range ? "page" : undefined}
        className={`platform-button ${days.success && days.data === range ? "platform-button-primary" : ""}`}>Last {range} days</Link>)}
    </nav>
    {!days.success ? <p role="alert">Choose a 7, 30, or 90 day reporting period.</p>
      : report.error || !parsed.success ? <p role="alert">Could not load blog analytics. Please retry or contact your agency.</p>
      : <section className="grid gap-5">
        <div className="platform-panel p-5">
          <h2 className="text-sm font-medium">Post views</h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{parsed.data.visits.toLocaleString()}</p>
          <p className="mt-2 text-sm text-zinc-500">Recorded views of individual posts over the last {days.data} days (UTC), including today.</p>
        </div>
        <div className="platform-panel p-5">
          <h2 className="font-semibold">Top posts</h2>
          {parsed.data.posts.length ? <ol className="mt-2 divide-y divide-zinc-200">
            {parsed.data.posts.map((post) => <li key={post.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <a href={blogManagerHref(siteId, editorPageId, post.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 wrap-break-word hover:underline">{post.title}</a>
              <span className="shrink-0 tabular-nums">{post.visits.toLocaleString()} {post.visits === 1 ? "view" : "views"}</span>
            </li>)}
          </ol> : <p className="mt-2 text-sm text-zinc-500">No post views recorded in this period yet.</p>}
        </div>
      </section>}
  </main>;
}
