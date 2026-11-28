import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { normalizeGraderUrl } from "./fetch";
import { graderRpc } from "./worker";

export const graderInputSchema = z.strictObject({
  url: z.string().trim().min(1).max(2048),
  businessName: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  hasGoogleProfile: z.enum(["yes", "no", "not_sure"]).optional(),
  googleMapsUrl: z.url().max(2048).optional(),
});

const createdSchema = z.union([
  z.object({ id: z.uuid(), slug: z.string() }),
  z.object({ error: z.enum(["rate_limit", "busy", "not_found"]) }),
]);

export function prepareGraderInput(raw: z.infer<typeof graderInputSchema>) {
  const url = normalizeGraderUrl(raw.url);
  return {
    url: url.href,
    businessName: raw.businessName || undefined,
    city: raw.city || undefined,
    hasGoogleProfile: raw.hasGoogleProfile,
    googleMapsUrl: raw.googleMapsUrl || undefined,
  };
}

export function graderClientIp(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!isIP(ip) || !salt || salt.length < 32) {
    console.error("Grader rate limiting is not configured", {
      reasons: [...(!isIP(ip) ? ["Client IP missing or invalid"] : []),
        ...(!salt || salt.length < 32 ? ["ANALYTICS_HASH_SALT missing or shorter than 32 characters"] : [])],
    });
    return null;
  }
  return { ip, hash: createHmac("sha256", salt).update(ip).digest("hex") };
}

export type GraderReportOptions = {
  /** Admin scans skip the per-IP limit and show the full report without the email gate. */
  source?: "public" | "admin";
  /** Starts a competitor scan linked to this (fully visible) report. */
  compareSlug?: string;
};

export async function createGraderReport(input: ReturnType<typeof prepareGraderInput>, ipHash: string, userAgent: string,
  options: GraderReportOptions = {}) {
  const url = new URL(input.url);
  const label = (input.businessName || url.hostname).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
  const slug = `${label}-${randomBytes(8).toString("hex")}`;
  return createdSchema.parse(await graderRpc("grader_create_report", {
    p_slug: slug, p_url: input.url, p_domain: url.hostname, p_business_name: input.businessName ?? null,
    p_city: input.city ?? null, p_profile: input.hasGoogleProfile ?? null, p_maps_url: input.googleMapsUrl ?? null,
    p_ip_hash: ipHash, p_user_agent: userAgent, p_source: options.source ?? "public",
    p_compare_slug: options.compareSlug ?? null,
  }));
}

export function graderLimitMessage(error: "busy" | "rate_limit" | "not_found") {
  if (error === "not_found") return "This report can't be compared yet.";
  return error === "busy" ? "We're busy, try again soon." : "Too many scans. Please try again later.";
}
