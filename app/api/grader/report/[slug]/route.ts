import { z } from "zod";
import { graderHeaders } from "@/lib/grader/http";
import { graderRpc } from "@/lib/grader/worker";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  const headers = graderHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? undefined });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = graderHeaders(request);
  if (!headers) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const { slug } = await params;
  if (!z.string().regex(/^[a-z0-9-]{1,60}$/).safeParse(slug).success) {
    return Response.json({ error: "Not found." }, { status: 404, headers });
  }
  try {
    const report = await graderRpc("grader_get_report", { p_slug: slug });
    return report ? Response.json(report, { headers }) : Response.json({ error: "Not found." }, { status: 404, headers });
  } catch {
    console.error("Could not load grader report");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
