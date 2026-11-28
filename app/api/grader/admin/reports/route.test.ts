import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/grader/admin-auth", () => ({ graderAdmin: mocks.auth }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

it("requires a super admin before listing reports", async () => {
  mocks.auth.mockResolvedValue({ ok: false, status: 403 });
  expect((await GET(new Request("https://app.sitomax.com/api/grader/admin/reports"))).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("rejects invalid filters and exports CSV with the export limit", async () => {
  expect((await GET(new Request("https://app.sitomax.com/api/grader/admin/reports?grade=Z"))).status).toBe(400);
  const response = await GET(new Request("https://app.sitomax.com/api/grader/admin/reports?source=admin&format=csv"));
  expect(response.headers.get("content-type")).toContain("text/csv");
  expect(mocks.rpc).toHaveBeenCalledWith("grader_admin_list_reports", expect.objectContaining({ p_source: "admin", p_limit: 5000, p_offset: 0 }));
});
