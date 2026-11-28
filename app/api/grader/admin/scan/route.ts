import { after } from "next/server";
import { graderAdmin } from "@/lib/grader/admin-auth";
import { createGraderReport, graderClientIp, graderInputSchema, graderLimitMessage, prepareGraderInput } from "@/lib/grader/create-report";
import { processGraderReport } from "@/lib/grader/scan";
import { graderSlugSchema } from "@/lib/grader/public-report";
import { readTextBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
const schema = graderInputSchema.extend({ compareSlug: graderSlugSchema.optional() });

export async function POST(request: Request) {
  const auth = await graderAdmin();
  if (!auth.ok) return Response.json({ error: "Not authorized." }, { status: auth.status, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin." }, { status: 403, headers });
  }
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
  let input: ReturnType<typeof prepareGraderInput>;
  const { compareSlug, ...fields } = parsed.data;
  try { input = prepareGraderInput(fields); }
  catch { return Response.json({ error: "Enter a valid public website URL." }, { status: 400, headers }); }
  const clientIp = graderClientIp(request);
  if (!clientIp) return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  try {
    const report = await createGraderReport(input, clientIp.hash, request.headers.get("user-agent") ?? "",
      { source: "admin", compareSlug });
    if ("error" in report) return Response.json({ error: graderLimitMessage(report.error) },
      { status: report.error === "not_found" ? 404 : 429, headers });
    after(() => processGraderReport(report.id, input));
    return Response.json({ slug: report.slug }, { status: 202, headers });
  } catch {
    console.error("Could not start administrator grader scan");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
