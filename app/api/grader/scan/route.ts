import { after } from "next/server";
import { z } from "zod";
import { createGraderReport, graderClientIp, graderInputSchema, graderLimitMessage, prepareGraderInput } from "@/lib/grader/create-report";
import { graderHeaders, verifyTurnstile } from "@/lib/grader/http";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { processGraderReport } from "@/lib/grader/scan";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = graderInputSchema.extend({
  turnstileToken: z.string().min(1).max(4096),
  /** Scans a competitor for comparison with this complete, unlocked report. */
  compareSlug: graderSlugSchema.optional(),
});

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
  const { turnstileToken, compareSlug, ...fields } = parsed.data;
  let input: ReturnType<typeof prepareGraderInput>;
  try { input = prepareGraderInput(fields); }
  catch { return Response.json({ error: "Enter a valid public website URL." }, { status: 400, headers }); }
  const clientIp = graderClientIp(request);
  if (!clientIp) {
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
  if (!(await verifyTurnstile(turnstileToken, clientIp.ip))) {
    return Response.json({ error: "Verification failed. Please try again." }, { status: 403, headers });
  }
  try {
    const result = await createGraderReport(input, clientIp.hash, request.headers.get("user-agent") ?? "", { compareSlug });
    if ("error" in result) return Response.json({ error: graderLimitMessage(result.error) },
      { status: result.error === "not_found" ? 404 : 429, headers });
    after(() => processGraderReport(result.id, input));
    return Response.json({ slug: result.slug }, { status: 202, headers });
  } catch {
    console.error("Could not start grader scan");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
