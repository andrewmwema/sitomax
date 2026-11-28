"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { adminReportSchema, type AdminGraderReport } from "@/lib/grader/report-schema";
import { GraderCompare } from "@/components/grader/compare";
import { GraderReport, graderLabel } from "./grader-report";
import { copyGraderShareLink, GraderReportsList, graderRowShareable, setGraderShareDisabled,
  type GraderListRow } from "./grader-reports-list";
import { graderShareUrl } from "@/lib/grader/presentation";

function ProspectActions({ report, onChanged }: { report: AdminGraderReport; onChanged: () => void }) {
  const [message, setMessage] = useState("");
  const shareable = graderRowShareable({ status: report.status, unlocked: report.unlocked ?? false, source: report.source ?? "public" });
  async function toggle() {
    try {
      await setGraderShareDisabled(report.slug, !report.share_disabled);
      setMessage(report.share_disabled ? "Share link enabled." : "Share link disabled. The link now shows “not found”.");
      onChanged();
    } catch { setMessage("Couldn't update the share link."); }
  }
  return <section className="platform-panel flex flex-col gap-3 p-5" aria-label="Share this report">
    <div><h2 className="text-[15px] font-semibold">Send to your prospect</h2>
      <p className="mt-1 text-xs text-[var(--platform-muted)]">{report.source === "admin"
        ? "Admin scans show the full report without the email gate."
        : report.unlocked ? "This report was unlocked by the visitor." : "This public report is still locked, so it can't be shared. Re-run it as an admin scan to share it."}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      {shareable && !report.share_disabled ? <>
        <button type="button" className="platform-button platform-button-primary" onClick={async () => setMessage(await copyGraderShareLink(report.slug))}>Copy share link</button>
        <a className="platform-button" href={graderShareUrl(report.slug)} target="_blank" rel="noopener noreferrer">Open share page</a>
      </> : null}
      <a className="platform-button" href={`/api/grader/admin/pdf/${encodeURIComponent(report.slug)}`} download>Download PDF</a>
      {shareable ? <button type="button" className="platform-button" onClick={toggle}>{report.share_disabled ? "Enable share link" : "Disable share link"}</button> : null}
    </div>
    <p role="status" className="text-xs text-[var(--platform-muted)]">{message}</p>
  </section>;
}

const slugSchema = z.string().regex(/^[a-z0-9-]{1,60}$/);
const startSchema = z.object({ slug: slugSchema });

export function GraderAdmin({ initialSlug }: { initialSlug: string | null }) {
  const [slug, setSlug] = useState(initialSlug);
  const [report, setReport] = useState<AdminGraderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/grader/admin/report/${encodeURIComponent(slug!)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? "Your session cannot access this report. Sign in as a super admin." : "Couldn't load the report.");
        const parsed = adminReportSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("The report has an invalid format.");
        if (controller.signal.aborted) return;
        setReport(parsed.data);
        setError(null);
        if (parsed.data.status === "queued" || parsed.data.status === "running") timer = setTimeout(poll, 1500);
        else setListKey((value) => value + 1);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn't load the report.");
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [slug, retry]);

  function open(next: string) {
    setReport(null);
    setError(null);
    setSlug(next);
    window.history.replaceState(null, "", `?report=${encodeURIComponent(next)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startScan(body: Record<string, string>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/grader/admin/scan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(json);
        throw new Error(message.success ? message.data.error : "Couldn't start the scan.");
      }
      open(startSchema.parse(json).slug);
      setListKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't start the scan.");
    } finally { setSubmitting(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const profile = String(data.get("hasGoogleProfile") ?? "");
    void startScan({
      url: String(data.get("url") ?? ""),
      businessName: String(data.get("businessName") ?? ""),
      city: String(data.get("city") ?? ""),
      ...(profile ? { hasGoogleProfile: profile } : {}),
    });
  }

  function rerun(row: GraderListRow) {
    void startScan({
      url: row.url_input,
      ...(row.business_name ? { businessName: row.business_name } : {}),
      ...(row.city ? { city: row.city } : {}),
      ...(row.has_google_profile ? { hasGoogleProfile: row.has_google_profile } : {}),
      ...(row.google_maps_url ? { googleMapsUrl: row.google_maps_url } : {}),
    });
  }

  const running = Boolean(slug && (!report || report.status === "queued" || report.status === "running"));
  return <div className="flex flex-col gap-5">
    <form onSubmit={submit} className="platform-panel grid gap-4 p-5 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Website URL
        <input name="url" required maxLength={2048} placeholder="example.com" className="h-11 rounded-lg border border-[var(--platform-line)] px-3 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Business name (optional)
        <input name="businessName" maxLength={160} className="h-11 rounded-lg border border-[var(--platform-line)] px-3 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">City (optional)
        <input name="city" maxLength={160} className="h-11 rounded-lg border border-[var(--platform-line)] px-3 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">Google Business Profile (optional)
        <select name="hasGoogleProfile" defaultValue="" className="h-11 rounded-lg border border-[var(--platform-line)] px-3 font-normal">
          <option value="">Not provided</option><option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option>
        </select>
      </label>
      <div className="flex items-end"><button type="submit" disabled={submitting || (running && !error)}
        className="platform-button platform-button-primary disabled:opacity-50">{submitting ? "Starting…" : "Run scan"}</button></div>
    </form>
    {error ? <div role="alert" className="platform-panel p-4 text-sm text-red-700">{error}
      {slug ? <button type="button" className="ml-3 underline" onClick={() => setRetry((value) => value + 1)}>Retry report</button> : null}
    </div> : null}
    {running && !error ? <section className="platform-panel p-5" aria-live="polite">
      <h2 className="text-lg font-semibold">Scanning…</h2>
      <p className="mt-1 text-sm text-[var(--platform-muted)]">Checking the website, PageSpeed and local presence.</p>
      {report && Object.keys(report.progress).length ? <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {Object.entries(report.progress).map(([name, status]) => <li key={name}>{graderLabel(name)}: {status === "unknown" ? "Couldn't check" : status === "complete" ? "Complete" : status === "failed" ? "Failed" : "Checking…"}</li>)}
      </ul> : null}
    </section> : null}
    {report?.status === "failed" ? <p role="alert" className="platform-panel p-5">The scan failed. Check the URL and try again.</p> : null}
    {report?.status === "complete" ? <ProspectActions report={report}
      onChanged={() => { setRetry((value) => value + 1); setListKey((value) => value + 1); }} /> : null}
    {report?.status === "complete" ? <GraderReport report={report} /> : null}
    {report?.status === "complete" && (report.unlocked || report.source === "admin")
      ? <GraderCompare key={report.slug} base={report} mode="admin" /> : null}
    <GraderReportsList refreshKey={listKey} onOpen={open} onRerun={rerun} />
  </div>;
}
