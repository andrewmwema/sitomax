import { graderHeaders } from "@/lib/grader/http";
import { graderRpc } from "@/lib/grader/worker";
import { graderSlugSchema, publicReportSchema } from "@/lib/grader/public-report";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  const headers = graderHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? undefined });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = graderHeaders(request);
  if (!headers) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const { slug } = await params;
  if (!graderSlugSchema.safeParse(slug).success) {
    return Response.json({ error: "Not found." }, { status: 404, headers });
  }
  try {
    const report = await graderRpc("grader_get_report", { p_slug: slug });
    if (!report) return Response.json({ error: "Not found." }, { status: 404, headers });
    const parsed = publicReportSchema.safeParse(report);
    if (!parsed.success) {
      console.error("Grader report returned an invalid public response");
      return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
    }
    return Response.json(parsed.data, { headers });
  } catch {
    console.error("Could not load grader report");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
