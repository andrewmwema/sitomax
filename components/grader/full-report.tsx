"use client";

import { useState } from "react";
import { brand } from "@/lib/brand";
import { graderCategories, graderCheckName, graderCtaUrl } from "@/lib/grader/presentation";
import type { PublicGraderReport } from "@/lib/grader/public-report";

const statuses = { pass: "Pass", warn: "Warning", fail: "Needs attention", unknown: "Couldn't check" } as const;

export function GraderFullReport({ report }: { report: PublicGraderReport }) {
  const [shareMessage, setShareMessage] = useState("");
  const cta = graderCtaUrl(report.slug);
  const checks = report.results?.checks ?? [];
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("Report link copied.");
    } catch { setShareMessage("Couldn't copy the link. Copy it from your browser's address bar."); }
  }
  return <section className="grader-full" aria-label="Full report">
    <div className="grader-full-actions">
      <a className="grader-button" href={`${brand.appUrl}/api/grader/pdf/${encodeURIComponent(report.slug)}`}>Download PDF</a>
      <button className="grader-secondary-button" type="button" onClick={share}>Share report</button>
      <span role="status">{shareMessage}</span>
    </div>
    <div className="grader-full-layout">
      <nav className="grader-section-nav" aria-label="Report sections"><strong>In this report</strong>
        <a href="#report-summary">Summary &amp; fix plan</a>
        {graderCategories.map(([key, label]) => checks.some((check) => check.category === key)
          ? <a key={key} href={`#report-${key}`}>{label}</a> : null)}
      </nav>
      <div>
        <section className="grader-card grader-report-section" id="report-summary">
          <h2>Summary &amp; fix plan</h2>
          {report.ai_summary ? <><p>{report.ai_summary.summary}</p><h3>Your fix plan</h3>
            <ol>{report.ai_summary.fix_plan.map((item, index) => <li key={index}>{item}</li>)}</ol></>
            : <p>AI summary and fix plan couldn&apos;t be generated for this scan.</p>}
        </section>
        {graderCategories.map(([key, label]) => {
          const items = checks.filter((check) => check.category === key);
          if (!items.length) return null;
          return <details className="grader-card grader-report-section" id={`report-${key}`} key={key} open>
            <summary><h2>{label}</h2></summary>
            {items.map((check) => <article className="grader-check" key={check.id}>
              <h3>{graderCheckName(check.id)}</h3>
              <span className={`grader-check-status grader-check-${check.status}`}>{statuses[check.status]}</span>
              {check.value !== null ? <p><strong>Found:</strong> {check.value}</p> : null}
              <p>{check.detail}</p>{check.fix ? <p><strong>How to improve:</strong> {check.fix}</p> : null}
            </article>)}
          </details>;
        })}
        <section className="grader-card grader-report-section"><h2>{brand.name} can fix this for you</h2>
          <p>Launch a faster, lead-ready site in 7 days.</p>
          {report.ai_summary?.sitomax_pitch ? <p>{report.ai_summary.sitomax_pitch}</p> : null}
          {cta ? <a href={cta} className="grader-button">Let&apos;s talk</a> : <p>Contact link is temporarily unavailable.</p>}
        </section>
      </div>
    </div>
  </section>;
}
