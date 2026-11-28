"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { publicReportSchema, type PublicGraderReport } from "@/lib/grader/public-report";
import { GraderUnlockForm } from "./unlock-form";
import { GraderFullReport } from "./full-report";
import { GraderCompare } from "./compare";
import { GraderSummary } from "./summary";

const progress = [
  ["html", "Looking at your homepage"], ["mobile", "Testing mobile speed"],
  ["desktop", "Testing desktop speed"], ["security", "Checking security"],
  ["local", "Looking at local presence"], ["summary", "Putting your results together"],
] as const;

export function GraderResults({ slug }: { slug: string }) {
  const [report, setReport] = useState<PublicGraderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${brand.appUrl}/api/grader/report/${encodeURIComponent(slug)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 404 ? "This report couldn't be found." : "Couldn't load your report. Please try again.");
        const data = publicReportSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setReport(data); setError(null);
        if (data.status === "queued" || data.status === "running") timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error && cause.message.includes("couldn't be found")
          ? cause.message : "Couldn't load your report. Please try again.");
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [slug, retry]);

  if (error) return <section className="grader-card grader-message" role="alert"><h1>We couldn&apos;t load your report.</h1>
    <p>{error}</p><button className="grader-button" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>;
  if (!report || report.status === "queued" || report.status === "running") return <section className="grader-card grader-progress" aria-live="polite">
    <p className="grader-kicker">Your scan is underway</p><h1>Getting to know your website.</h1>
    <p>We&apos;re checking the details that matter for your business.</p>
    <ul>{progress.map(([key, label]) => {
      const status = report?.progress[key];
      return <li key={key}><span className={status === "complete" ? "grader-dot grader-done" : "grader-dot"} aria-hidden="true">{status === "complete" ? "✓" : "·"}</span>
        <span>{label}</span><small>{status === "complete" ? "Done" : status === "unknown" || status === "failed" ? "Couldn't check" : "Checking…"}</small></li>;
    })}</ul>
    {report?.screenshot_url ? <Image unoptimized width={1200} height={900} src={report.screenshot_url} alt={`Screenshot of ${report.domain}`} className="grader-screenshot" /> : null}
  </section>;
  if (report.status === "failed") return <section className="grader-card grader-message" role="alert">
    <h1>We couldn&apos;t complete this scan.</h1><p>Check the website address and try again.</p><Link className="grader-button" href="/grader">Grade another website</Link>
  </section>;
  return <div className="grader-preview">
    <GraderSummary report={report} />
    {report.unlocked ? <GraderFullReport report={report}><GraderCompare base={report} mode="public" /></GraderFullReport> : <section className="grader-locked grader-card"><div aria-hidden="true" className="grader-lock">🔒</div>
      <h2>Unlock your full report + step-by-step fix plan</h2>
      <p>Get detailed checks and a practical plan for your website.</p>
      <GraderUnlockForm slug={slug} onUnlocked={() => setRetry((value) => value + 1)} />
    </section>}
    <Link className="grader-text-link" href="/grader">← Grade another website</Link>
  </div>;
}
