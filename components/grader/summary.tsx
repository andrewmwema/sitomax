import Image from "next/image";
import { graderCategories } from "@/lib/grader/presentation";
import type { PublicGraderReport } from "@/lib/grader/public-report";

export function GraderSummary({ report, kicker = "Your website report", title = "Here\u2019s how your site stacks up." }: {
  report: PublicGraderReport; kicker?: string; title?: string;
}) {
  return <>
    <p className="grader-kicker">{kicker}</p><h1>{title}</h1>
    <p className="grader-lede grader-domain">{report.domain}</p>
    <section className="grader-score-card grader-card"><div>
      <div className="grader-ring" style={{ "--score": `${report.scores?.overall ?? 0}%` } as React.CSSProperties}>
        <div><strong>{report.scores?.overall ?? "—"}</strong><span>out of 100</span></div>
      </div>
      <p className="grader-grade">{report.scores?.grade ? `Grade ${report.scores.grade}` : "Couldn't score"}</p>
      <p>{report.headline ?? "Your website check is complete."}</p>
    </div>
    {report.screenshot_url ? <Image unoptimized width={1200} height={900} src={report.screenshot_url} alt={`Screenshot of ${report.domain}`} className="grader-screenshot" />
      : <div className="grader-screenshot-placeholder">Screenshot couldn&apos;t be checked.</div>}</section>
    <section className="grader-card grader-breakdown"><h2>Your score breakdown</h2>
      {graderCategories.filter(([key]) => key !== "accessibility").map(([key, label]) => {
        const score = report.scores?.categories[key] ?? null;
        return <div className="grader-category" key={key}><span>{label}</span>
          <div className="grader-bar"><i style={{ width: `${score ?? 0}%` }} /></div>
          <strong>{score === null ? "Couldn't check" : `${score}/100`}</strong></div>;
      })}</section>
    <section className="grader-issues"><h2>Where to focus first</h2>
      {report.top_issues?.length ? <div className="grader-issue-grid">{report.top_issues.slice(0, 3).map((issue, index) => <article className="grader-card" key={`${index}-${issue.title}`}>
        <span>0{index + 1} / OPPORTUNITY</span><h3>{issue.title}</h3><p>{issue.why_it_matters}</p></article>)}</div>
        : <p>We couldn&apos;t generate issue highlights for this scan.</p>}
    </section>
  </>;
}
