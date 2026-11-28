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
      .select("id, slug, url_input, final_url, domain, business_name, city, status, progress, results, scores, ai_summary, screenshot_url, source, share_disabled, unlocked")
      .eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Not found." }, { status: 404, headers });
    const { data: competitor, error: competitorError } = await auth.supabase.from("grader_reports").select("slug")
      .eq("compare_of", data.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (competitorError) throw competitorError;
    const report: Partial<typeof data> = { ...data };
    delete report.id;
    return Response.json({ ...report, competitor_slug: competitor?.slug ?? null }, { headers });
  } catch {
    console.error("Could not load administrator grader report");
    return Response.json({ error: "The grader is temporarily unavailable." }, { status: 503, headers });
  }
}
