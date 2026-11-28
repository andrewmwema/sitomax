import { cachedGraderPdf } from "@/lib/grader/pdf";
import { verifyGraderPdfLink } from "@/lib/grader/pdf-link";
import { loadSharedGraderReport } from "@/lib/grader/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const query = new URL(request.url).searchParams;
  if (!verifyGraderPdfLink(slug, query.get("expires"), query.get("sig")))
    return Response.json({ error: "This download link has expired. Reload the report page to get a new one." }, { status: 403, headers });
  try {
    const report = await loadSharedGraderReport(slug);
    if (!report) return Response.json({ error: "Report not found." }, { status: 404, headers });
    const pdf = await cachedGraderPdf(report);
    return new Response(new Uint8Array(pdf), { headers: {
      ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug}.pdf"`,
    } });
  } catch {
    console.error("Could not serve shared grader PDF", { slug });
    return Response.json({ error: "Couldn't download the PDF. Please try again." }, { status: 503, headers });
  }
}
