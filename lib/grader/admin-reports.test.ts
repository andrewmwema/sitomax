import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { graderReportsCsv, listGraderReports, parseGraderAdminFilters, type GraderAdminRow } from "./admin-reports";

const row: GraderAdminRow = {
  id: "50da05be-c0bc-4d58-a49f-44f59f44bf09", slug: "joes-1234", created_at: "2026-05-01T10:00:00Z",
  domain: "joes.example", business_name: "=Joe's \"Pizza\"", url_input: "https://joes.example/", final_url: null,
  city: null, has_google_profile: null, google_maps_url: null, status: "complete", overall: 72, grade: "C",
  source: "public", unlocked: true, share_disabled: false, unlock_name: "Joe", unlock_email: "joe@example.com",
  lead_id: "60da05be-c0bc-4d58-a49f-44f59f44bf09", compare_of_slug: null,
};

describe("grader admin reports", () => {
  it("parses filters and rejects invalid values", () => {
    expect(parseGraderAdminFilters(new URLSearchParams("q=joe&grade=C&unlocked=locked&from=2026-05-01&page=2")).data)
      .toEqual({ q: "joe", grade: "C", unlocked: "locked", from: "2026-05-01", page: 2 });
    expect(parseGraderAdminFilters(new URLSearchParams("grade=")).success).toBe(true);
    expect(parseGraderAdminFilters(new URLSearchParams("grade=Z")).success).toBe(false);
    expect(parseGraderAdminFilters(new URLSearchParams("from=2026-13-40")).success).toBe(false);
    expect(parseGraderAdminFilters(new URLSearchParams("source=other")).success).toBe(false);
  });

  it("maps filters to the listing RPC with an inclusive end date and pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, total_count: 31 }], error: null });
    const result = await listGraderReports({ rpc } as never, { unlocked: "unlocked", to: "2026-05-31", page: 2 });
    expect(rpc).toHaveBeenCalledWith("grader_admin_list_reports", expect.objectContaining({
      p_unlocked: true, p_to: "2026-06-01T00:00:00.000Z", p_from: null, p_limit: 25, p_offset: 25,
    }));
    expect(result).toEqual({ total: 31, rows: [row] });
  });

  it("exports CSV with lead and share links and neutralizes formulas", () => {
    const csv = graderReportsCsv([row], "https://app.sitomax.com");
    const [header, line] = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(header).toContain('"Share link"');
    expect(line).toContain(`"'=Joe's ""Pizza"""`);
    expect(line).toContain('"https://app.sitomax.com/dashboard/leads/60da05be-c0bc-4d58-a49f-44f59f44bf09"');
    expect(line).toContain('"https://sitomax.com/grade/joes-1234"');
  });
});
