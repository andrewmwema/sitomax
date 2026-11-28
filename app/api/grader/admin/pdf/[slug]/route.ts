import { graderAdmin } from "@/lib/grader/admin-auth";
import { adminFullReport } from "@/lib/grader/admin-reports";
import { cachedGraderPdf } from "@/lib/grader/pdf";
import { graderSlugSchema } from "@/lib/grader/public-report";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await graderAdmin();
  if (!auth.ok) return Response.json({ error: "Not authorized." }, { status: auth.status, headers });
  const { slug } = await params;
  if (!graderSlugSchema.safeParse(slug).success) return Response.json({ error: "Not found." }, { status: 404, headers });
  try {
    const report = await adminFullReport(auth.supabase, slug);
    if (!report) return Response.json({ error: "Report not found or not complete." }, { status: 404, headers });
    const pdf = await cachedGraderPdf(report);
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"` } });
  } catch {
    console.error("Could not generate administrator grader PDF", { slug });
    return Response.json({ error: "Couldn't download the PDF. Please try again." }, { status: 503, headers });
  }
}
