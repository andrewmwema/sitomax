import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { after } from "next/server";
import { z } from "zod";
import { normalizeGraderUrl } from "@/lib/grader/fetch";
import { graderHeaders, verifyTurnstile } from "@/lib/grader/http";
import { processGraderReport } from "@/lib/grader/scan";
import { graderRpc } from "@/lib/grader/worker";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.strictObject({
  url: z.string().trim().min(1).max(2048),
  businessName: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  hasGoogleProfile: z.enum(["yes", "no", "not_sure"]).optional(),
  googleMapsUrl: z.url().max(2048).optional(),
  turnstileToken: z.string().min(1).max(4096),
});
const createdSchema = z.union([
  z.object({ id: z.uuid(), slug: z.string() }),
  z.object({ error: z.enum(["rate_limit", "busy"]) }),
]);

export function OPTIONS(request: Request) {
  const headers = graderHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? undefined });
}

export async function POST(request: Request) {
  const headers = graderHeaders(request);
  if (!headers) return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Invalid request format." }, { status: 415, headers });
  }
  const body = await readTextBody(request, 8192);
  if (body === null) return Response.json({ error: "Request too large." }, { status: 413, headers });
  let json: unknown;
  try { json = JSON.parse(body); }
  catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400, headers });
  let url: URL;
  try { url = normalizeGraderUrl(parsed.data.url); }
  catch { return Response.json({ error: "Enter a valid public website URL." }, { status: 400, headers }); }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!isIP(ip) || !salt || salt.length < 32) {
    console.error("Grader rate limiting is not configured");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return Response.json({ error: "Verification failed. Please try again." }, { status: 403, headers });
  }
  const hash = createHmac("sha256", salt).update(ip).digest("hex");
  const label = (parsed.data.businessName || url.hostname).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
  const slug = `${label}-${randomBytes(8).toString("hex")}`;
  const input = {
    url: url.href,
    businessName: parsed.data.businessName || undefined,
    city: parsed.data.city || undefined,
    hasGoogleProfile: parsed.data.hasGoogleProfile,
    googleMapsUrl: parsed.data.googleMapsUrl || undefined,
  };
  try {
    const result = createdSchema.parse(await graderRpc("grader_create_report", {
      p_slug: slug, p_url: input.url, p_domain: url.hostname, p_business_name: input.businessName ?? null,
      p_city: input.city ?? null, p_profile: input.hasGoogleProfile ?? null, p_maps_url: input.googleMapsUrl ?? null,
      p_ip_hash: hash, p_user_agent: request.headers.get("user-agent") ?? "",
    }));
    if ("error" in result) return Response.json({
      error: result.error === "busy" ? "We're busy, try again soon." : "Too many scans. Please try again later.",
    }, { status: 429, headers });
    after(() => processGraderReport(result.id, input));
    return Response.json({ slug: result.slug }, { status: 202, headers });
  } catch {
    console.error("Could not start grader scan");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
