import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GraderResults } from "@/components/grader/results";
import { graderSlugSchema } from "@/lib/grader/public-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your website grade | SitoMax",
  robots: { index: false, follow: false },
};

export default async function GraderResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!graderSlugSchema.safeParse(slug).success) notFound();
  return <main className="grader-wrap grader-results-page"><GraderResults slug={slug} /></main>;
}
