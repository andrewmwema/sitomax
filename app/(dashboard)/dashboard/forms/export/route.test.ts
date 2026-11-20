import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  owner: true,
  offsets: [] as number[],
  filters: [] as unknown[][],
  fullBatch: false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    rpc: async () => ({ data: mocks.admin, error: null }),
    from: (table: string) => {
      if (table === "sites") return { select: async () => ({ data: [{ id: "00000000-0000-4000-8000-000000000001", account_id: "account", name: "=Unsafe", subdomain: "client" }], error: null }) };
      if (table === "account_members") return { select: () => ({ eq: () => ({ eq: async () => ({ data: mocks.owner ? [{ account_id: "account" }] : [], error: null }) }) }) };
      let start = 0;
      const query = {
        select: () => query, order: () => query,
        eq: (column: string, value: unknown) => { mocks.filters.push(["eq", column, value]); return query; },
        in: (column: string, value: unknown) => { mocks.filters.push(["in", column, value]); return query; },
        gte: (column: string, value: unknown) => { mocks.filters.push(["gte", column, value]); return query; },
        range: (offset: number) => { start = offset; mocks.offsets.push(start); return query; },
        then: (resolve: (value: { data: object[]; error: null }) => unknown) => {
          const row = { site_id: "00000000-0000-4000-8000-000000000001", form_name: "contact", page_path: "/", data: { Name: "Alex" },
            created_at: "2026-01-01", last_activity_at: "2026-01-02", is_read: false, status: "new" };
          const data = start === 0 ? Array.from({ length: mocks.fullBatch ? 500 : 1 }, () => row) : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
import { GET } from "./route";

beforeEach(() => { mocks.admin = false; mocks.owner = true; mocks.offsets = []; mocks.filters = []; mocks.fullBatch = false; });
describe("submission CSV export", () => {
  it("exports all pages and neutralizes spreadsheet formulas", async () => {
    mocks.fullBatch = true;
    const response = await GET(new Request("https://agency.test/dashboard/forms/export"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('"\'=Unsafe"');
    expect(csv).toContain('"{""Name"":""Alex""}"');
    expect(mocks.offsets).toEqual([0, 500]);
  });
  it("denies editors and inaccessible site filters", async () => {
    mocks.owner = false;
    expect((await GET(new Request("https://agency.test/dashboard/forms/export"))).status).toBe(403);
    mocks.owner = true;
    expect((await GET(new Request("https://agency.test/dashboard/forms/export?site=00000000-0000-4000-8000-000000000002"))).status).toBe(403);
  });
  it("exports an authorized selected site", async () => {
    expect((await GET(new Request("https://agency.test/dashboard/forms/export?site=00000000-0000-4000-8000-000000000001"))).status).toBe(200);
  });
  it("applies the same search, status and date filters as the submissions view", async () => {
    const response = await GET(new Request("https://agency.test/dashboard/forms/export?days=7&status=new&q=not-present"));
    expect(response.status).toBe(200);
    expect((await response.text()).split("\r\n").filter(Boolean)).toHaveLength(1);
    expect(mocks.filters).toContainEqual(["in", "site_id", ["00000000-0000-4000-8000-000000000001"]]);
    expect(mocks.filters).toContainEqual(["eq", "status", "new"]);
    expect(mocks.filters.some(([operator, column]) => operator === "gte" && column === "created_at")).toBe(true);
  });
  it("limits a selected export to the requested IDs and rejects invalid IDs", async () => {
    const url = "https://agency.test/dashboard/forms/export";
    expect((await GET(new Request(`${url}?id=bad`))).status).toBe(400);
    const id = "00000000-0000-4000-8000-000000000003";
    expect((await GET(new Request(`${url}?id=${id}`))).status).toBe(200);
    expect(mocks.filters).toContainEqual(["in", "id", [id]]);
  });
  it("rejects malformed filters rather than exporting all records", async () => {
    expect((await GET(new Request("https://agency.test/dashboard/forms/export?days=invalid"))).status).toBe(400);
    expect(mocks.offsets).toEqual([]);
  });
});
