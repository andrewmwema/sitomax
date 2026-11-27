import "server-only";

import { z } from "zod";
import { fetchGraderUrl } from "./fetch";
import { extractPageText, htmlChecks, profileCheck, unknownHtmlChecks } from "./html";
import { crawlerChecks, securityChecks } from "./network-checks";
import { runPageSpeed } from "./pagespeed";
import { isPlacesEnabled, placesChecks } from "./places";
import { scoreChecks } from "./scoring";
import { makeSummary } from "./summary";
import { graderRpc, graderWorker } from "./worker";
import type { Check, GraderInput } from "./types";

const cacheSchema = z.object({
  results: z.object({ places_enabled: z.boolean() }).passthrough(),
  scores: z.unknown(), ai_summary: z.unknown(), screenshot_url: z.string().nullable(),
});

async function update(id: string, value: Record<string, unknown>) {
  await graderRpc("grader_update_report", { p_id: id, p_update: value });
}

function checkProgress(checks: Check[]) {
  return Object.fromEntries(checks.map((check) => [check.id, check.status === "unknown" ? "unknown" : "complete"]));
}

async function saveScreenshot(id: string, data: string | null): Promise<string | null> {
  if (!data) return null;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match || match[2].length > 4 * 1024 * 1024) {
    console.warn("PageSpeed screenshot had an invalid format", { reportId: id });
    return null;
  }
  const bytes = Buffer.from(match[2], "base64");
  const valid = match[1] === "jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!valid || bytes.length > 3 * 1024 * 1024) {
    console.warn("PageSpeed screenshot was invalid or too large", { reportId: id });
    return null;
  }
  const { client } = graderWorker();
  const path = `${id}.${match[1] === "jpeg" ? "jpg" : "png"}`;
  const storage = client.storage.from("grader-screenshots");
  const { error } = await storage.upload(path, bytes, { contentType: `image/${match[1]}`, upsert: false });
  if (error) {
    console.error("Could not save grader screenshot", { reportId: id });
    return null;
  }
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function processGraderReport(id: string, input: GraderInput) {
  try {
    await update(id, { status: "running", progress: { html: "running" } });
    const page = await fetchGraderUrl(input.url);
    await update(id, { final_url: page.url, progress: { html: "complete", pagespeed: "running", local: "running", security: "running" } });
    const cached = cacheSchema.safeParse(await graderRpc("grader_get_cache", { p_id: id, p_final_url: page.url }));
    if (cached.success && cached.data.results.places_enabled === isPlacesEnabled()) {
      await update(id, { ...cached.data, status: "complete",
        progress: { html: "complete", pagespeed: "complete", local: "complete", security: "complete", summary: "complete" } });
      return;
    }

    const mime = page.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    const readable = page.status === 200 && (!mime || mime === "text/html" || mime === "application/xhtml+xml");
    const html = readable ? page.body.toString("utf8") : "";
    if (!readable) console.warn("Grader could not inspect page HTML", { reportId: id, status: page.status, mime });
    const htmlResults = readable ? htmlChecks(html) : unknownHtmlChecks();
    const pageText = readable ? extractPageText(html) : "";
    const profile = profileCheck(input);
    await update(id, { progress: checkProgress([...htmlResults, profile]) });

    const [mobile, desktop, security, crawler, local] = await Promise.all([
      runPageSpeed(page.url, "mobile").then(async (result) => {
        const screenshotUrl = await saveScreenshot(id, result.screenshot);
        await update(id, { progress: { mobile: "complete", ...checkProgress(result.checks) }, ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}) });
        return { ...result, screenshotUrl };
      }),
      runPageSpeed(page.url, "desktop").then(async (result) => {
        await update(id, { progress: { desktop: "complete", ...checkProgress(result.checks) } });
        return result;
      }),
      securityChecks(page.url, new URL(page.url).protocol === "https:").then(async (result) => {
        await update(id, { progress: { security: "complete", ...checkProgress(result) } });
        return result;
      }),
      crawlerChecks(page.url).then(async (result) => {
        await update(id, { progress: checkProgress(result) });
        return result;
      }),
      placesChecks(id, input, page.url, pageText).then(async (result) => {
        await update(id, { progress: { local: "complete", ...checkProgress(result) } });
        return result;
      }),
    ]);
    const checks = [...htmlResults, profile, ...mobile.checks, ...desktop.checks, ...security, ...crawler, ...local];
    const scores = scoreChecks(checks);
    await update(id, { progress: { pagespeed: "complete", summary: "running" }, scores });
    const summary = await makeSummary(id, checks);
    await update(id, {
      status: "complete", results: { checks, places_enabled: isPlacesEnabled() }, scores,
      ai_summary: summary, ...(mobile.screenshotUrl ? { screenshot_url: mobile.screenshotUrl } : {}),
      progress: { summary: summary ? "complete" : "unknown" },
    });
  } catch {
    console.error("Grader scan failed", { reportId: id });
    try { await update(id, { status: "failed", progress: { scan: "failed" } }); }
    catch { console.error("Could not record grader scan failure", { reportId: id }); }
  }
}
