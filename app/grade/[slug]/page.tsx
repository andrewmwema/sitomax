import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GraderFullReport } from "@/components/grader/full-report";
import { GraderSummary } from "@/components/grader/summary";
import { brand } from "@/lib/brand";
import { signedGraderPdfPath } from "@/lib/grader/pdf-link";
import { graderShareUrl } from "@/lib/grader/presentation";
import { loadSharedGraderReport } from "@/lib/grader/share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robots = { index: false, follow: false };
  // Share pages live on the marketing apex, not the app host used by the root layout.
  const url = graderShareUrl(slug);
  const metadataBase = new URL(new URL(url).origin);
  const report = await loadSharedGraderReport(slug).catch(() => null);
  if (!report) return { title: `Website report | ${brand.name}`, robots, metadataBase };
  const name = report.business_name || report.domain;
  const score = report.scores?.overall;
  const description = score == null
    ? `Website report for ${report.domain}.`
    : `${report.domain} scored ${score}/100${report.scores?.grade ? ` (grade ${report.scores.grade})` : ""} in the ${brand.name} website grader.`;
  return {
    title: `${name} website report | ${brand.name}`,
    description,
    robots,
    metadataBase,
    alternates: { canonical: url },
    openGraph: { title: `${report.domain} website report`, description, siteName: brand.name, type: "article", url },
    twitter: { card: "summary_large_image", title: `${report.domain} website report`, description },
  };
}

export default async function SharedGraderReportPage({ params }: Props) {
  const { slug } = await params;
  let report;
  try { report = await loadSharedGraderReport(slug); }
  catch {
    return <main className="grader-wrap grader-results-page"><section className="grader-card grader-message" role="alert">
      <h1>We couldn&apos;t load this report.</h1><p>Please refresh the page in a moment.</p>
    </section></main>;
  }
  if (!report) notFound();
  const pdfHref = signedGraderPdfPath(report.slug) ?? undefined;
  return <main className="grader-wrap grader-results-page"><div className="grader-preview">
    <GraderSummary report={report} kicker={`${brand.name} website report`} title={report.business_name ? `How ${report.business_name} stacks up.` : "Here\u2019s how this website stacks up."} />
    <GraderFullReport report={report} pdfHref={pdfHref} readOnly />
  </div></main>;
}
