import { z } from "zod";
import { brand } from "@/lib/brand";

export const graderCategories = [
  ["speed", "Speed"], ["mobile", "Mobile"], ["seo", "Search visibility"],
  ["security", "Security & trust"], ["conversion", "Lead capture"],
  ["local", "Local presence"], ["social", "Social & content"], ["accessibility", "Accessibility"],
] as const;

export type GraderTone = "pass" | "warn" | "fail" | "unknown";

export function graderScoreTone(score: number | null | undefined): GraderTone {
  return score === null || score === undefined ? "unknown" : score >= 80 ? "pass" : score >= 60 ? "warn" : "fail";
}

export function graderScoreLabel(score: number | null | undefined): string {
  return { pass: "Good", warn: "Needs work", fail: "Poor", unknown: "Couldn't check" }[graderScoreTone(score)];
}

export function graderGradeTone(grade: string | null | undefined): GraderTone {
  return !grade ? "unknown" : grade === "A" || grade === "B" ? "pass" : grade === "C" ? "warn" : "fail";
}

export function graderContactUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_GRADER_CTA_URL;
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(configured);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
  return url.href;
}

export function graderCtaUrl(slug: string): string | null {
  const configured = graderContactUrl();
  if (!configured) return null;
  const url = new URL(configured);
  url.searchParams.set("utm_source", "website_grader");
  url.searchParams.set("utm_medium", "report");
  url.searchParams.set("ref", "grader");
  url.searchParams.set("report", slug);
  return url.href;
}

/** Read-only share page for a full report, on the marketing host. */
export function graderShareUrl(slug: string): string {
  const protocol = brand.rootDomain.includes("localhost") ? "http" : "https";
  return new URL(`/grade/${encodeURIComponent(slug)}`, `${protocol}://${brand.rootDomain}`).href;
}
