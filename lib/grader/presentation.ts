import { z } from "zod";

export const graderCategories = [
  ["speed", "Speed"], ["mobile", "Mobile"], ["seo", "Search visibility"],
  ["security", "Security & trust"], ["conversion", "Lead capture"],
  ["local", "Local presence"], ["social", "Social & content"], ["accessibility", "Accessibility"],
] as const;

export function graderCheckName(id: string) {
  const label = id.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
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
