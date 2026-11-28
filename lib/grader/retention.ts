import "server-only";

import { z } from "zod";
import { graderPdfPath } from "./pdf";
import { graderRpc, graderWorker } from "./worker";

const expiredSchema = z.object({
  retention_days: z.number().int(),
  reports: z.array(z.object({ id: z.uuid(), slug: z.string(), screenshot_url: z.string().nullable() })),
});

export type GraderRetentionResult = { retentionDays: number | null; deleted: number; failures: number };

const BATCH = 200;

/**
 * Deletes locked public scans older than grader_config.retention_days, with their screenshots and any cached PDF.
 * Unlocked reports, admin scans and competitor scans attached to them are kept permanently (enforced in SQL).
 * Rows are only deleted after their files were removed, so a storage failure never leaves orphaned files.
 */
export async function processGraderRetention(deadline = Date.now() + 45_000): Promise<GraderRetentionResult> {
  const result: GraderRetentionResult = { retentionDays: null, deleted: 0, failures: 0 };
  const { client } = graderWorker();
  while (Date.now() < deadline) {
    const parsed = expiredSchema.safeParse(await graderRpc("grader_retention_expired", { p_limit: BATCH }));
    if (!parsed.success) {
      console.error("Grader retention received an invalid response");
      result.failures += 1;
      break;
    }
    result.retentionDays = parsed.data.retention_days;
    const reports = parsed.data.reports;
    if (!reports.length) break;
    const screenshots = await client.storage.from("grader-screenshots")
      .remove(reports.flatMap((report) => [`${report.id}.jpg`, `${report.id}.png`]));
    const pdfs = await client.storage.from("grader-reports").remove(reports.map((report) => graderPdfPath(report.slug)));
    if (screenshots.error || pdfs.error) {
      console.error("Grader retention could not delete stored files", {
        stage: screenshots.error ? "screenshots" : "pdfs", count: reports.length,
      });
      result.failures += 1;
      break;
    }
    const deleted = z.number().int().parse(await graderRpc("grader_delete_expired", { p_ids: reports.map((report) => report.id) }));
    result.deleted += deleted;
    if (deleted < reports.length || reports.length < BATCH) break;
  }
  if (result.deleted) console.info("Grader retention deleted expired scans", { deleted: result.deleted, retentionDays: result.retentionDays });
  return result;
}
