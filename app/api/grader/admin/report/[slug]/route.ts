import { z } from "zod";
import { graderAdmin } from "@/lib/grader/admin-auth";
import { graderRpc } from "@/lib/grader/worker";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await graderAdmin();
  if (!auth.ok) return Response.json({ error: "Not authorized." }, { status: auth.status, headers });
  const { slug } = await params;
  if (!z.string().regex(/^[a-z0-9-]{1,60}$/).safeParse(slug).success) {
    return Response.json({ error: "Not found." }, { status: 404, headers });
  }
  try {
    await graderRpc("grader_get_report", { p_slug: slug });
    const { data, error } = await auth.supabase.from("grader_reports")
      .select("slug, url_input, final_url, domain, business_name, city, status, progress, results, scores, ai_summary, screenshot_url")
      .eq("slug", slug).maybeSingle();
    if (error) throw error;
    return data ? Response.json(data, { headers }) : Response.json({ error: "Not found." }, { status: 404, headers });
  } catch {
    console.error("Could not load administrator grader report");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
