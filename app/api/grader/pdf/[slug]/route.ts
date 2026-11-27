import { graderHeaders } from "@/lib/grader/http";
import { graderPdf } from "@/lib/grader/pdf";
import { graderSlugSchema } from "@/lib/grader/public-report";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = graderHeaders(request);
  if (!headers) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const { slug } = await params;
  if (!graderSlugSchema.safeParse(slug).success)
    return Response.json({ error: "Not found." }, { status: 404, headers });
  try {
    const pdf = await graderPdf(slug);
    if (!pdf) return Response.json({ error: "Report not found or locked." }, { status: 404, headers });
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${slug}.pdf"`);
    return new Response(new Uint8Array(pdf), { headers });
  } catch {
    console.error("Could not generate grader PDF", { slug });
    return Response.json({ error: "Couldn't download the PDF. Please try again." }, { status: 503, headers });
  }
}
