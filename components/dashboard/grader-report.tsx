"use client";

import Image from "next/image";
import { GRADER_STATUS_LABELS, groupCategoryChecks } from "@/lib/grader/check-presentation";
import { CATEGORIES, type Category, type CheckStatus } from "@/lib/grader/types";
import type { AdminGraderReport } from "@/lib/grader/report-schema";

const categories: Record<Category, string> = {
  speed: "Speed", mobile: "Mobile", seo: "SEO", security: "Security & trust",
  conversion: "Lead capture", local: "Local presence", social: "Social & content", accessibility: "Accessibility",
};
const badge: Record<CheckStatus, string> = {
  fail: "bg-red-50 text-red-800 ring-red-200", warn: "bg-amber-50 text-amber-900 ring-amber-200",
  pass: "bg-emerald-50 text-emerald-800 ring-emerald-200", unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

function StatusBadge({ status, label }: { status: CheckStatus; label: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${badge[status]}`}>{label}</span>;
}

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
      if (!checks.some((check) => check.category === category)) return <section key={category} className="platform-panel p-5">
        <h2 className="text-lg font-semibold">{categories[category]}</h2>
        <p className="mt-2 text-sm text-[var(--platform-muted)]">{category === "local" && !report.results?.places_enabled
          ? "Google Places checks are not enabled." : "No checks available."}</p>
      </section>;
      const { findings, unknown, passed } = groupCategoryChecks(checks, category);
      return <section key={category} className="platform-panel p-5">
        <h2 className="text-lg font-semibold">{categories[category]}
          <span className="ml-2 text-sm font-normal text-[var(--platform-muted)]">{report.scores?.categories[category] == null
            ? "Couldn't check" : `${report.scores.categories[category]}/100`}</span></h2>
        <ul className="mt-3 divide-y divide-[var(--platform-line)]">
          {findings.map((item) => <li key={item.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{item.label}</h3><StatusBadge status={item.status} label={item.statusLabel} />
            </div>
            {item.found ? <p className="mt-1 break-words"><strong>What we found:</strong> {item.found}</p> : null}
            <p className="mt-1 break-words">{item.detail}</p>
            {item.fix ? <p className="mt-1 break-words"><strong>How to improve:</strong> {item.fix}</p> : null}
          </li>)}
          {unknown.map((group) => <li key={group.reason} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{group.labels.join(", ")}</h3><StatusBadge status="unknown" label={GRADER_STATUS_LABELS.unknown} />
            </div>
            <p className="mt-1 break-words">{group.reason}</p>
          </li>)}
          {passed.length ? <li className="py-3 text-sm"><StatusBadge status="pass" label={GRADER_STATUS_LABELS.pass} />
            <p className="mt-1"><strong>Passed:</strong> {passed.map((item) => item.label).join(", ")}</p></li> : null}
        </ul>
      </section>;
    })}
  </div>;
}
