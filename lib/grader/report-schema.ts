import { z } from "zod";
import { CATEGORIES } from "./types";

const check = z.object({
  id: z.string(), category: z.enum(CATEGORIES), status: z.enum(["pass", "warn", "fail", "unknown"]),
  value: z.union([z.string(), z.number(), z.null()]), detail: z.string(), fix: z.string(),
});

export const adminReportSchema = z.object({
  slug: z.string(), url_input: z.string(), final_url: z.string().nullable(), domain: z.string(),
  business_name: z.string().nullable(), city: z.string().nullable(),
  status: z.enum(["queued", "running", "complete", "failed"]),
  progress: z.record(z.string(), z.string()),
  results: z.object({ checks: z.array(check), places_enabled: z.boolean() }).nullable(),
  scores: z.object({
    overall: z.number().nullable(), grade: z.string().nullable(),
    categories: z.record(z.string(), z.number().nullable()),
  }).nullable(),
  ai_summary: z.object({
    headline: z.string(), summary: z.string(),
    top_issues: z.array(z.object({ check_id: z.string(), title: z.string(), why_it_matters: z.string(), fix: z.string() })),
    fix_plan: z.array(z.string()), sitomax_pitch: z.string(),
  }).nullable(),
  screenshot_url: z.url().nullable(),
});
export type AdminGraderReport = z.infer<typeof adminReportSchema>;
