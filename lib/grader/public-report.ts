import { z } from "zod";
import { adminReportSchema } from "./report-schema";

export const graderSlugSchema = z.string().regex(/^[a-z0-9-]{1,60}$/);

// The public RPC deliberately returns only teaser fields until unlocked.
export const publicReportSchema = z.object({
  slug: graderSlugSchema,
  url: z.string().nullable(),
  domain: z.string(),
  status: adminReportSchema.shape.status,
  progress: adminReportSchema.shape.progress,
  scores: adminReportSchema.shape.scores,
  screenshot_url: adminReportSchema.shape.screenshot_url,
  unlocked: z.boolean(),
  // Optional until migration 0068 is applied everywhere.
  scanned_at: z.string().nullable().optional(),
  business_name: z.string().nullable().optional(),
  headline: z.string().nullable(),
  top_issues: z.array(z.object({ title: z.string(), why_it_matters: z.string() })).nullable(),
  results: adminReportSchema.shape.results.optional(),
  ai_summary: adminReportSchema.shape.ai_summary.optional(),
}).superRefine((report, ctx) => {
  if (!report.unlocked && (report.results !== undefined || report.ai_summary !== undefined || report.business_name !== undefined)) {
    ctx.addIssue({ code: "custom", message: "Locked reports must not contain full results." });
  }
  if (report.unlocked && (report.results === undefined || report.ai_summary === undefined)) {
    ctx.addIssue({ code: "custom", message: "Unlocked reports must include their complete result fields." });
  }
});

export type PublicGraderReport = z.infer<typeof publicReportSchema>;
