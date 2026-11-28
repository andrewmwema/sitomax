import { z } from "zod";
import type { Category, Check, CheckStatus } from "./types";

const auditSchema = z.object({
  score: z.number().nullable().optional(),
  numericValue: z.number().optional(),
  displayValue: z.string().optional(),
  details: z.object({ data: z.string().optional() }).passthrough().optional(),
}).passthrough();
const responseSchema = z.object({
  lighthouseResult: z.object({
    audits: z.record(z.string(), auditSchema.catch({})),
    categories: z.record(z.string(), z.object({ score: z.number().nullable().optional() }).passthrough().catch({})).optional(),
  }).passthrough(),
  loadingExperience: z.object({
    metrics: z.record(z.string(), z.object({ percentile: z.number().optional() }).passthrough()).optional(),
  }).passthrough().optional(),
}).passthrough();
type Audit = z.infer<typeof auditSchema>;
type Lighthouse = z.infer<typeof responseSchema>["lighthouseResult"];
type Spec = { id: string; category: Category; audit: string; label: string; fix: string };

const common: Spec[] = [
  { id: "lcp", category: "speed", audit: "largest-contentful-paint", label: "Largest Contentful Paint", fix: "Optimize the largest visible content and server response." },
  { id: "cls", category: "speed", audit: "cumulative-layout-shift", label: "Cumulative Layout Shift", fix: "Reserve space for images and dynamic content." },
  { id: "tbt", category: "speed", audit: "total-blocking-time", label: "Total Blocking Time", fix: "Reduce long JavaScript tasks." },
  { id: "page_weight", category: "speed", audit: "total-byte-weight", label: "Total page weight", fix: "Reduce the amount of data downloaded by the page." },
];
const mobile: Spec[] = [
  { id: "tap_targets", category: "mobile", audit: "tap-targets", label: "Tap targets", fix: "Make interactive targets large enough and spaced apart." },
  { id: "font_sizes", category: "mobile", audit: "font-size", label: "Font sizes", fix: "Use readable font sizes on mobile." },
  { id: "mixed_content", category: "security", audit: "is-on-https", label: "HTTPS and mixed content", fix: "Load all page resources securely over HTTPS." },
  { id: "contrast", category: "accessibility", audit: "color-contrast", label: "Color contrast", fix: "Increase contrast between text and its background." },
];

function status(score: number | null | undefined): CheckStatus {
  return score === null || score === undefined ? "unknown" : score >= 0.9 ? "pass" : score >= 0.5 ? "warn" : "fail";
}

function auditCheck(spec: Spec, audit: Audit | undefined, prefix = ""): Check {
  const checkStatus = status(audit?.score);
  return {
    id: `${prefix}${spec.id}`, category: spec.category, status: checkStatus,
    value: audit?.displayValue ?? audit?.numericValue ?? null,
    detail: checkStatus === "unknown" ? `Couldn't check ${spec.label} with PageSpeed.`
      : `${spec.label}: ${audit?.displayValue ?? audit?.numericValue ?? "PageSpeed audit result"}.`,
    fix: spec.fix,
  };
}

function categoryCheck(id: string, category: Category, value: number | null | undefined, label: string): Check {
  const checkStatus = status(value);
  return {
    id, category, status: checkStatus,
    value: typeof value === "number" ? Math.round(value * 100) : null,
    detail: checkStatus === "unknown" ? `Couldn't check the ${label} PageSpeed score.`
      : `${label} PageSpeed score: ${Math.round((value ?? 0) * 100)}/100.`,
    fix: `Work through Google PageSpeed's recommendations for ${label}.`,
  };
}

export function pageSpeedChecks(result: Lighthouse | null, strategy: "mobile" | "desktop"): Check[] {
  const prefix = `${strategy}_`;
  const checks = [
    categoryCheck(`${prefix}performance`, "speed", result?.categories?.performance?.score, `${strategy} speed`),
    ...common.map((spec) => auditCheck(spec, result?.audits[spec.audit], prefix)),
  ];
  if (strategy === "mobile") {
    checks.push(...mobile.map((spec) => auditCheck(spec, result?.audits[spec.audit])));
    checks.push(categoryCheck("psi_seo", "seo", result?.categories?.seo?.score, "SEO"));
    checks.push(categoryCheck("psi_accessibility", "accessibility", result?.categories?.accessibility?.score, "accessibility"));
  }
  return checks;
}

export async function runPageSpeed(url: string, strategy: "mobile" | "desktop") {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  for (const category of ["performance", "seo", "accessibility", "best-practices"]) endpoint.searchParams.append("category", category);
  if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(35_000), cache: "no-store" });
    if (!response.ok) {
      console.warn("PageSpeed request failed", { strategy, status: response.status });
      return { checks: pageSpeedChecks(null, strategy), screenshot: null };
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn("PageSpeed response was invalid", { strategy });
      return { checks: pageSpeedChecks(null, strategy), screenshot: null };
    }
    const lighthouse = parsed.data.lighthouseResult;
    const screenshot = strategy === "mobile" ? lighthouse.audits["final-screenshot"]?.details?.data ?? null : null;
    const checks = pageSpeedChecks(lighthouse, strategy);
    const metrics = parsed.data.loadingExperience?.metrics;
    const inp = metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ?? metrics?.INTERACTION_TO_NEXT_PAINT_MS?.percentile;
    if (typeof inp === "number" && Number.isFinite(inp) && inp >= 0) {
      checks.push({
        id: `${strategy}_inp`, category: "speed", value: inp,
        status: inp <= 200 ? "pass" : inp <= 500 ? "warn" : "fail",
        detail: `${strategy} field Interaction to Next Paint: ${inp} ms.`,
        fix: "Reduce the time the page takes to respond to interactions.",
      });
    }
    return { checks, screenshot };
  } catch {
    console.warn("PageSpeed request could not be completed", { strategy });
    return { checks: pageSpeedChecks(null, strategy), screenshot: null };
  }
}
