import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/grader/admin-auth", () => ({ graderAdmin: mocks.auth }));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
import { GET } from "./route";

const request = new Request("https://app.sitomax.com/api/grader/admin/report/test");
const context = { params: Promise.resolve({ slug: "test" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }) }),
  } });
  mocks.rpc.mockResolvedValue({});
  mocks.query.mockResolvedValue({ data: { slug: "test", results: { checks: [{ id: "title" }] }, ai_summary: { fix_plan: ["Fix"] } }, error: null });
});

it("only returns full results after admin authorization and an RLS-backed read", async () => {
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ results: { checks: [{ id: "title" }] }, ai_summary: { fix_plan: ["Fix"] } });
  expect(mocks.query).toHaveBeenCalledOnce();
});

it("does not read or return results for a non-admin", async () => {
  mocks.auth.mockResolvedValue({ ok: false, status: 403 });
  expect((await GET(request, context)).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("fails explicitly if the report cannot be read", async () => {
  mocks.query.mockResolvedValue({ data: null, error: { code: "db-error" } });
  expect((await GET(request, context)).status).toBe(503);
});
