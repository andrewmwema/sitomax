"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { graderShareUrl } from "@/lib/grader/presentation";
import { TableScrollArea } from "./table-scroll-area";

const rowSchema = z.object({
  id: z.string(), slug: z.string(), created_at: z.string(), domain: z.string(), business_name: z.string().nullable(),
  url_input: z.string(), final_url: z.string().nullable(), city: z.string().nullable(),
  has_google_profile: z.enum(["yes", "no", "not_sure"]).nullable(), google_maps_url: z.string().nullable(),
  status: z.enum(["queued", "running", "complete", "failed"]), overall: z.number().nullable(), grade: z.string().nullable(),
  source: z.enum(["public", "admin"]), unlocked: z.boolean(), share_disabled: z.boolean(),
  unlock_name: z.string().nullable(), unlock_email: z.string().nullable(), lead_id: z.string().nullable(),
  compare_of_slug: z.string().nullable(),
});
const listSchema = z.object({ rows: z.array(rowSchema), total: z.number(), pageSize: z.number() });
export type GraderListRow = z.infer<typeof rowSchema>;

type Filters = { q: string; unlocked: string; grade: string; source: string; from: string; to: string };
const emptyFilters: Filters = { q: "", unlocked: "", grade: "", source: "", from: "", to: "" };
const statusLabels = { queued: "Queued", running: "Scanning", complete: "Complete", failed: "Failed" } as const;
const control = "h-10 rounded-lg border border-[var(--platform-line)] bg-white px-3 text-sm font-normal";

function query(filters: Filters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  return params;
}

export function graderRowShareable(row: Pick<GraderListRow, "status" | "unlocked" | "source">) {
  return row.status === "complete" && (row.unlocked || row.source === "admin");
}

export async function copyGraderShareLink(slug: string) {
  try { await navigator.clipboard.writeText(graderShareUrl(slug)); return "Share link copied."; }
  catch { return `Couldn't copy. Share link: ${graderShareUrl(slug)}`; }
}

export async function setGraderShareDisabled(slug: string, disabled: boolean) {
  const response = await fetch("/api/grader/admin/share", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, disabled }),
  });
  if (!response.ok) throw new Error("Couldn't update the share link.");
}

export function GraderReportsList({ refreshKey, onOpen, onRerun }: {
  refreshKey: number;
  onOpen: (slug: string) => void;
  onRerun: (row: GraderListRow) => void;
}) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<z.infer<typeof listSchema> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/grader/admin/reports?${query(filters, page)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 400 ? "Check the filters and try again." : "Couldn't load reports.");
        const parsed = listSchema.parse(await response.json());
        if (!controller.signal.aborted) { setData(parsed); setError(null); }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error && cause.message.startsWith("Check") ? cause.message : "Couldn't load reports.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [filters, page, refreshKey, reload]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  async function toggleShare(row: GraderListRow) {
    try {
      await setGraderShareDisabled(row.slug, !row.share_disabled);
      setMessage(row.share_disabled ? `Share link enabled for ${row.domain}.` : `Share link disabled for ${row.domain}.`);
      setReload((value) => value + 1);
    } catch { setMessage("Couldn't update the share link."); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (key: keyof Filters) => (event: { target: { value: string } }) => setDraft((value) => ({ ...value, [key]: event.target.value }));
  return <section className="platform-panel overflow-hidden" aria-labelledby="grader-reports-heading">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--platform-line)] px-5 py-4">
      <div><h2 id="grader-reports-heading" className="text-[15px] font-semibold">Reports</h2>
        <p className="mt-1 text-xs text-[var(--platform-muted)]">Every public and admin scan, newest first.{data ? ` ${data.total.toLocaleString("en")} matching.` : ""}</p></div>
      <a href={`/api/grader/admin/reports?${query(filters, 1)}&format=csv`} className="platform-button">Export CSV</a>
    </header>
    <form onSubmit={apply} className="grid gap-3 border-b border-[var(--platform-line)] px-5 py-4 sm:grid-cols-2 lg:grid-cols-7">
      <label className="flex flex-col gap-1 text-xs font-medium lg:col-span-2">Search
        <input type="search" value={draft.q} onChange={set("q")} maxLength={200} placeholder="Domain, business, name or email" className={control} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Access
        <select value={draft.unlocked} onChange={set("unlocked")} className={control}>
          <option value="">All</option><option value="unlocked">Unlocked</option><option value="locked">Locked</option></select></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Grade
        <select value={draft.grade} onChange={set("grade")} className={control}>
          <option value="">All</option>{["A", "B", "C", "D", "F"].map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          <option value="none">No grade</option></select></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Source
        <select value={draft.source} onChange={set("source")} className={control}>
          <option value="">All</option><option value="public">Public</option><option value="admin">Admin</option></select></label>
      <label className="flex flex-col gap-1 text-xs font-medium">From
        <input type="date" value={draft.from} onChange={set("from")} className={control} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">To
        <input type="date" value={draft.to} onChange={set("to")} className={control} /></label>
      <div className="flex items-end gap-2 lg:col-span-7">
        <button type="submit" className="platform-button platform-button-primary">Apply filters</button>
        <button type="button" className="platform-button" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }}>Clear</button>
      </div>
    </form>
    <p role="status" className="px-5 pt-3 text-xs text-[var(--platform-muted)]">{message}</p>
    {error ? <p role="alert" className="px-5 py-4 text-sm text-[var(--platform-error)]">{error}
      <button type="button" className="ml-3 underline" onClick={() => setReload((value) => value + 1)}>Retry</button></p>
      : !data ? <p className="px-5 py-8 text-center text-sm text-[var(--platform-muted)]">Loading reports…</p>
      : data.rows.length ? <TableScrollArea label="Grader reports"><table className="w-full min-w-[1150px] text-left text-sm" aria-busy={loading}>
        <thead><tr>{["Date", "Website", "Score", "Status", "Source", "Unlocked by", "Lead", "Actions"].map((heading) =>
          <th key={heading} className="px-5 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.id} className="align-top">
          <td className="px-5 whitespace-nowrap text-xs tabular-nums">{new Date(row.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
          <th scope="row" className="px-5 text-left font-medium"><span className="block">{row.business_name || row.domain}</span>
            {row.business_name ? <span className="block text-xs font-normal text-[var(--platform-muted)]">{row.domain}</span> : null}
            {row.compare_of_slug ? <span className="block text-xs font-normal text-[var(--platform-muted)]">Competitor scan</span> : null}</th>
          <td className="px-5 tabular-nums">{row.overall === null ? "—" : `${row.overall}/100`}{row.grade ? <span className="ml-1 font-semibold">· {row.grade}</span> : null}</td>
          <td className="px-5">{statusLabels[row.status]}</td>
          <td className="px-5">{row.source === "admin" ? "Admin scan" : "Public"}</td>
          <td className="px-5">{row.unlocked ? <><span className="block">{row.unlock_name ?? "Unlocked"}</span>
            {row.unlock_email ? <span className="block text-xs text-[var(--platform-muted)]">{row.unlock_email}</span> : null}</>
            : <span className="text-[var(--platform-muted)]">{row.source === "admin" ? "Not needed" : "Locked"}</span>}</td>
          <td className="px-5">{row.lead_id ? <Link href={`/dashboard/leads/${row.lead_id}`} className="text-[var(--platform-accent)] underline">Open lead</Link>
            : <span className="text-[var(--platform-muted)]">—</span>}</td>
          <td className="px-5"><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
            <button type="button" className="underline" onClick={() => onOpen(row.slug)}>Open full report</button>
            {row.status === "complete" ? <a className="underline" href={`/api/grader/admin/pdf/${encodeURIComponent(row.slug)}`} download>Download PDF</a> : null}
            {graderRowShareable(row) && !row.share_disabled
              ? <button type="button" className="underline" onClick={async () => setMessage(await copyGraderShareLink(row.slug))}>Copy share link</button> : null}
            {graderRowShareable(row) ? <button type="button" className="underline" onClick={() => toggleShare(row)}>
              {row.share_disabled ? "Enable share link" : "Disable share link"}</button> : null}
            <button type="button" className="underline" onClick={() => onRerun(row)}>Re-run scan</button>
          </div></td>
        </tr>)}</tbody>
      </table></TableScrollArea>
      : <p className="px-5 py-8 text-center text-sm text-[var(--platform-muted)]">No reports match these filters.</p>}
    {data && data.total > data.pageSize ? <nav aria-label="Report pages" className="flex items-center justify-between border-t border-[var(--platform-line)] px-5 py-3 text-sm">
      <button type="button" className="platform-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" className="platform-button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
    </nav> : null}
  </section>;
}
