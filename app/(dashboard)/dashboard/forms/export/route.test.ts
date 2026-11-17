import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  owner: true,
  offsets: [] as number[],
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
        select: () => query, order: () => query, eq: () => query,
        range: (offset: number) => { start = offset; mocks.offsets.push(start); return query; },
        then: (resolve: (value: { data: object[]; error: null }) => unknown) => {
          const data = start === 0 ? [{ site_id: "00000000-0000-4000-8000-000000000001", form_name: "contact", page_path: "/", data: { Name: "Alex" }, created_at: "2026-01-01", is_read: false }] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
import { GET } from "./route";

beforeEach(() => { mocks.admin = false; mocks.owner = true; mocks.offsets = []; });
describe("submission CSV export", () => {
  it("exports all pages and neutralizes spreadsheet formulas", async () => {
    const response = await GET(new Request("https://agency.test/dashboard/forms/export"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('"\'=Unsafe"');
    expect(csv).toContain('"{""Name"":""Alex""}"');
    expect(mocks.offsets).toEqual([0, 1]);
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
});
