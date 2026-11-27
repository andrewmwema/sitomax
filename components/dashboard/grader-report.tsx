"use client";

import Image from "next/image";
import { CATEGORIES, type Category } from "@/lib/grader/types";
import type { AdminGraderReport } from "@/lib/grader/report-schema";

const categories: Record<Category, string> = {
  speed: "Speed", mobile: "Mobile", seo: "SEO", security: "Security & trust",
  conversion: "Lead capture", local: "Local presence", social: "Social & content", accessibility: "Accessibility",
};
const labels = { pass: "Pass", warn: "Warn", fail: "Fail", unknown: "Couldn't check" } as const;

export function graderLabel(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function GraderReport({ report }: { report: AdminGraderReport }) {
  const checks = report.results?.checks ?? [];
  return <div className="flex flex-col gap-5">
    {!report.results ? <p role="alert" className="platform-panel p-4">The scan completed without check results.</p> : null}
    <section className="platform-panel p-5">
      <h2 className="text-lg font-semibold">Results for {report.business_name || report.domain}</h2>
      <p className="mt-1 break-all text-sm text-[var(--platform-muted)]">{report.final_url || report.url_input}</p>
      {report.scores ? <>
        <p className="mt-4 text-3xl font-semibold">{report.scores.overall === null ? "Couldn't score" : `${report.scores.overall}/100`}
          {report.scores.grade ? ` · ${report.scores.grade}` : ""}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => <li key={category} className="rounded-lg border border-[var(--platform-line)] p-3 text-sm">
            <span className="block text-[var(--platform-muted)]">{categories[category]}</span>
            <strong>{report.scores?.categories[category] == null ? "Couldn't check" : `${report.scores.categories[category]}/100`}</strong>
          </li>)}
        </ul>
        <p className="mt-3 text-xs text-[var(--platform-muted)]">Accessibility is reported separately and is not included in the overall score.</p>
      </> : <p className="mt-4 text-sm">Scores are not available yet.</p>}
      {report.screenshot_url ? <Image src={report.screenshot_url} width={1200} height={900} unoptimized
        alt={`PageSpeed screenshot of ${report.domain}`} className="mt-5 h-auto max-h-[600px] w-auto max-w-full rounded-lg border border-[var(--platform-line)] object-contain" />
        : <p className="mt-4 text-sm text-[var(--platform-muted)]">Screenshot: Couldn&apos;t check.</p>}
    </section>
    <section className="platform-panel p-5">
      <h2 className="text-lg font-semibold">AI summary</h2>
      {report.ai_summary ? <div className="mt-3 space-y-3 text-sm">
        <h3 className="font-semibold">{report.ai_summary.headline}</h3>
        <p>{report.ai_summary.summary}</p>
        <h4 className="font-semibold">Top issues</h4>
        <ol className="list-decimal space-y-2 pl-5">{report.ai_summary.top_issues.map((issue) =>
          <li key={issue.check_id}><strong>{issue.title}</strong><p>{issue.why_it_matters}</p><p>Fix: {issue.fix}</p></li>)}</ol>
        <h4 className="font-semibold">Fix plan</h4>
        <ol className="list-decimal space-y-1 pl-5">{report.ai_summary.fix_plan.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <p>{report.ai_summary.sitomax_pitch}</p>
      </div> : <p className="mt-3 text-sm">Couldn&apos;t generate an AI summary for this scan.</p>}
    </section>
    {CATEGORIES.map((category) => {
      const items = checks.filter((check) => check.category === category);
      return <section key={category} className="platform-panel p-5">
        <h2 className="text-lg font-semibold">{categories[category]}</h2>
        {category === "local" && !report.results?.places_enabled
          ? <p className="mt-2 text-sm text-[var(--platform-muted)]">Google Places checks are not enabled.</p> : null}
        {items.length ? <ul className="mt-3 divide-y divide-[var(--platform-line)]">{items.map((item) =>
          <li key={item.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{graderLabel(item.id)}</h3>
              <span className={item.status === "fail" ? "font-semibold text-red-700" : item.status === "warn" ? "font-semibold text-amber-700"
                : item.status === "pass" ? "font-semibold text-emerald-700" : "text-[var(--platform-muted)]"}>{labels[item.status]}</span>
            </div>
            {item.value !== null ? <p className="mt-1 break-words"><strong>Value:</strong> {item.value}</p> : null}
            <p className="mt-1 break-words">{item.detail}</p>
            <p className="mt-1 break-words text-[var(--platform-secondary)]"><strong>Fix:</strong> {item.fix}</p>
          </li>)}</ul> : <p className="mt-3 text-sm">No checks available.</p>}
      </section>;
    })}
  </div>;
}
