import { z } from "zod";

const reportCount = z.number().int().nonnegative();
export const siteAnalyticsReportSchema = z.object({
  visits: reportCount,
  unique_visitors: reportCount,
  form_submissions: reportCount,
  daily: z.array(z.object({ day: z.string(), visits: reportCount })),
  pages: z.array(z.object({ label: z.string(), count: reportCount })),
  referrers: z.array(z.object({ label: z.string(), count: reportCount })),
  devices: z.array(z.object({ label: z.string(), count: reportCount })),
});
export type SiteAnalyticsReport = z.infer<typeof siteAnalyticsReportSchema>;

export const beaconSchema = z.object({
  path: z.string().min(1).max(2048).regex(/^\/(?!\/)[^?#]*$/),
  referrer: z.string().max(2048),
}).strict();

export function referrerOrigin(referrer: string, host: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol) || url.host.toLowerCase() === host.toLowerCase()) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function deviceFromUserAgent(userAgent: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|playbook|silk|android(?!.*mobile)/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return "mobile";
  return "desktop";
}
