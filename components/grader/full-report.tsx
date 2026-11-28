"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { GRADER_STATUS_LABELS, groupCategoryChecks, type PresentedCheck } from "@/lib/grader/check-presentation";
import { graderCategories, graderCtaUrl, graderScoreLabel, graderScoreTone, graderShareUrl } from "@/lib/grader/presentation";
import type { PublicGraderReport } from "@/lib/grader/public-report";

function Finding({ check }: { check: PresentedCheck }) {
  return <article className="grader-check">
    <span className={`grader-check-status grader-check-${check.status}`}>{check.statusLabel}</span>
    <div>
      <h3>{check.label}</h3>
      {check.found ? <p><strong>What we found:</strong> {check.found}</p> : null}
      <p>{check.detail}</p>
      {check.fix ? <p><strong>How to improve:</strong> {check.fix}</p> : null}
    </div>
  </article>;
}

export function GraderFullReport({ report, pdfHref, readOnly = false, children }: {
  report: PublicGraderReport;
  /** Defaults to the unlock-protected same-host route; shared pages pass a signed, expiring link. */
  pdfHref?: string;
  /** Shared pages are read-only views for someone other than the report owner. */
  readOnly?: boolean;
  children?: React.ReactNode;
}) {
  const [shareMessage, setShareMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const cta = graderCtaUrl(report.slug);
  const checks = report.results?.checks ?? [];
  async function share() {
    try {
      await navigator.clipboard.writeText(readOnly || report.share_disabled ? window.location.href : graderShareUrl(report.slug));
      setShareMessage("Report link copied.");
    } catch { setShareMessage("Couldn't copy the link. Copy it from your browser's address bar."); }
  }
  async function download() {
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(pdfHref ?? `/grader/${encodeURIComponent(report.slug)}/pdf`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/pdf"))
        throw new Error("PDF unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.slug}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("Couldn't download your PDF. Please try again.");
    } finally { setDownloading(false); }
  }
  return <section className="grader-full" aria-label="Full report">
    <div className="grader-full-actions">
      <button className="grader-button" type="button" onClick={download} disabled={downloading}>{downloading ? "Preparing PDF…" : "Download PDF"}</button>
      <button className="grader-secondary-button" type="button" onClick={share}>Share report</button>
      <span role="status">{shareMessage}</span>
      {downloadError ? <p role="alert">{downloadError}</p> : null}
    </div>
    <div className="grader-full-layout">
      <nav className="grader-section-nav" aria-label="Report sections"><strong>In this report</strong>
        <a href="#report-summary">Summary &amp; fix plan</a>
        {graderCategories.map(([key, label]) => checks.some((check) => check.category === key)
          ? <a key={key} href={`#report-${key}`}>{label}</a> : null)}
        {children ? <a href="#report-compare">Compare with a competitor</a> : null}
      </nav>
      <div>
        <section className="grader-card grader-report-section" id="report-summary">
          <h2>Summary &amp; fix plan</h2>
          {report.ai_summary ? <><p>{report.ai_summary.summary}</p><h3>Your fix plan</h3>
            <ol>{report.ai_summary.fix_plan.map((item, index) => <li key={index}>{item}</li>)}</ol></>
            : <p>AI summary and fix plan couldn&apos;t be generated for this scan.</p>}
        </section>
        {graderCategories.map(([key, label]) => {
          if (!checks.some((check) => check.category === key)) return null;
          const { findings, unknown, passed } = groupCategoryChecks(checks, key);
          const score = report.scores?.categories[key] ?? null;
          return <details className="grader-card grader-report-section" id={`report-${key}`} key={key} open>
            <summary>
              <h2>{label}</h2>
              <span className={`grader-check-status grader-check-${graderScoreTone(score)}`}>
                {score === null ? graderScoreLabel(score) : `${score}/100 · ${graderScoreLabel(score)}`}
              </span>
              {key === "accessibility" ? <span className="grader-category-note">Not included in the overall score</span> : null}
            </summary>
            {findings.map((check) => <Finding check={check} key={check.id} />)}
            {unknown.map((group) => <article className="grader-check" key={group.reason}>
              <span className="grader-check-status grader-check-unknown">{GRADER_STATUS_LABELS.unknown}</span>
              <div><h3>{group.labels.join(", ")}</h3><p>{group.reason}</p></div>
            </article>)}
            {passed.length ? <article className="grader-check">
              <span className="grader-check-status grader-check-pass">{GRADER_STATUS_LABELS.pass}</span>
              <p className="grader-passed-list"><strong>Passed:</strong> {passed.map((check) => check.label).join(", ")}</p>
            </article> : null}
          </details>;
        })}
        <section className="grader-card grader-report-section"><h2>{brand.name} can fix this for you</h2>
          <p>Launch a faster, lead-ready site in 7 days.</p>
          {report.ai_summary?.sitomax_pitch ? <p>{report.ai_summary.sitomax_pitch}</p> : null}
          {cta ? <a href={cta} className="grader-button">Book a free consultation</a> : <p>Contact link is temporarily unavailable.</p>}
          {readOnly ? <p><Link className="grader-text-link" href="/grader">Get your own free grade →</Link></p> : null}
        </section>
        {children}
      </div>
    </div>
  </section>;
}
