import "server-only";
import { graderRpc } from "./worker";
import { graderSlugSchema, publicReportSchema, type PublicGraderReport } from "./public-report";

/**
 * Loads a report for the public /grade share page. Returns null unless the report is complete,
 * fully visible (unlocked or an admin scan) and its share link has not been disabled.
 */
export async function loadSharedGraderReport(slug: string): Promise<PublicGraderReport | null> {
  if (!graderSlugSchema.safeParse(slug).success) return null;
  const raw = await graderRpc("grader_get_report", { p_slug: slug });
  if (!raw) return null;
  const parsed = publicReportSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Grader share page received an invalid report", { slug });
    throw new Error("Invalid grader report.");
  }
  const report = parsed.data;
  return report.status === "complete" && report.unlocked && !report.share_disabled ? report : null;
}
