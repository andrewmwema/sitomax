import { brand } from "@/lib/brand";
import { graderAdmin } from "@/lib/grader/admin-auth";
import { GRADER_ADMIN_EXPORT_LIMIT, GRADER_ADMIN_PAGE_SIZE, graderReportsCsv, listGraderReports,
  parseGraderAdminFilters } from "@/lib/grader/admin-reports";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await graderAdmin();
  if (!auth.ok) return Response.json({ error: "Not authorized." }, { status: auth.status, headers });
  const params = new URL(request.url).searchParams;
  const filters = parseGraderAdminFilters(params);
  if (!filters.success) return Response.json({ error: "Invalid filters." }, { status: 400, headers });
  const csv = params.get("format") === "csv";
  try {
    const result = await listGraderReports(auth.supabase, filters.data,
      csv ? { limit: GRADER_ADMIN_EXPORT_LIMIT, offset: 0 } : {});
    if (!csv) return Response.json({ ...result, pageSize: GRADER_ADMIN_PAGE_SIZE }, { headers });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(graderReportsCsv(result.rows, brand.appUrl), { headers: {
      ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grader-reports-${date}.csv"`,
    } });
  } catch {
    return Response.json({ error: "Couldn't load grader reports." }, { status: 503, headers });
  }
}
