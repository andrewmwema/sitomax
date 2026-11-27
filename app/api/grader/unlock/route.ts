import { after } from "next/server";
import { z } from "zod";
import { graderClientIp } from "@/lib/grader/create-report";
import { graderHeaders, verifyTurnstile } from "@/lib/grader/http";
import { graderMarketingUrl, graderNotificationConfigured, processGraderNotifications } from "@/lib/grader/notification";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { graderRpc } from "@/lib/grader/worker";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 60;

const input = z.strictObject({
  slug: graderSlugSchema, name: z.string().trim().min(1).max(120),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(80).optional(),
  consentMarketing: z.boolean(), turnstileToken: z.string().min(1).max(4096),
});
const output = z.union([z.object({ ok: z.literal(true) }), z.object({ error: z.enum(["rate_limit", "unavailable"]) })]);

export function OPTIONS(request: Request) {
  const headers = graderHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? undefined });
}

export async function POST(request: Request) {
  const headers = graderHeaders(request);
  if (!headers) return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({ error: "Invalid request format." }, { status: 415, headers });
  const body = await readTextBody(request, 8192);
  if (body === null) return Response.json({ error: "Request too large." }, { status: 413, headers });
  let json: unknown;
  try { json = JSON.parse(body); }
  catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  const parsed = input.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Check your details and try again." }, { status: 400, headers });
  const ip = graderClientIp(request);
  const accountId = z.uuid().safeParse(process.env.GRADER_LEADS_ACCOUNT_ID);
  const siteId = z.uuid().safeParse(process.env.GRADER_LEADS_SITE_ID);
  if (!ip || !accountId.success || !siteId.success || !graderNotificationConfigured()) {
    console.error("Grader unlock is not configured");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
  if (!await verifyTurnstile(parsed.data.turnstileToken, ip.ip))
    return Response.json({ error: "Verification failed. Please try again." }, { status: 403, headers });
  try {
    const result = output.parse(await graderRpc("grader_unlock_report", {
      p_slug: parsed.data.slug, p_name: parsed.data.name, p_email: parsed.data.email,
      p_phone: parsed.data.phone || null, p_consent: parsed.data.consentMarketing,
      p_ip_hash: ip.hash, p_report_url: graderMarketingUrl(parsed.data.slug),
      p_account_id: accountId.data, p_site_id: siteId.data,
    }));
    if ("error" in result) return Response.json({ error: result.error === "rate_limit"
      ? "Too many attempts. Please try again later." : "This report isn't ready to unlock." },
    { status: result.error === "rate_limit" ? 429 : 404, headers });
    after(async () => {
      try { await processGraderNotifications(); }
      catch { console.error("Could not process grader notifications"); }
    });
    return Response.json({ ok: true }, { headers });
  } catch {
    console.error("Could not unlock grader report");
    return Response.json({ error: "Could not unlock the report. Please try again." }, { status: 503, headers });
  }
}
