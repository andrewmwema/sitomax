import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Submission } from "./submissions";

const mocks = vi.hoisted(() => ({
  rows: [] as Submission[],
  ranges: [] as number[][],
  filters: [] as unknown[][],
  error: null as null | { message: string },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      let start = 0;
      let end = 499;
      const query = {
        select: () => query,
        in: (column: string, values: string[]) => { mocks.filters.push(["in", column, values]); return query; },
        eq: (column: string, value: unknown) => { mocks.filters.push(["eq", column, value]); return query; },
        gte: (column: string, value: string) => { mocks.filters.push(["gte", column, value]); return query; },
        order: () => query,
        range: (from: number, to: number) => { start = from; end = to; mocks.ranges.push([from, to]); return query; },
        then: (resolve: (value: object) => unknown) => Promise.resolve({ data: mocks.rows.slice(start, end + 1), count: mocks.rows.length, error: mocks.error }).then(resolve),
      };
      return query;
    },
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { getSubmissionPage, SubmissionQueryError } from "./queries";
import { submissionFiltersSchema } from "./submissions";

const site = { id: "00000000-0000-4000-8000-000000000001", name: "Local Service", subdomain: "local" };
const now = new Date("2026-11-19T12:00:00Z");
beforeEach(() => {
  mocks.ranges = []; mocks.filters = []; mocks.error = null;
  mocks.rows = Array.from({ length: 510 }, (_, index) => ({
    id: String(index), site_id: site.id, form_name: "Contact", page_path: "/", is_read: false, created_at: now.toISOString(),
    data: { "Requested service": index >= 480 ? "Roof repair" : "Painting" },
  }));
});

describe("authorized submission browsing", () => {
  it("uses database pagination and scopes every query to permitted sites and active filters", async () => {
    const result = await getSubmissionPage(await createClient(), [site], submissionFiltersSchema.parse({ page: 2, site: site.id, days: "7", status: "new" }), now);
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].id).toBe("25");
    expect(mocks.ranges).toEqual([[25, 49]]);
    expect(mocks.filters).toEqual([
      ["in", "site_id", [site.id]], ["eq", "archived", false], ["eq", "site_id", site.id],
      ["gte", "created_at", "2026-11-12T12:00:00.000Z"], ["eq", "status", "new"],
    ]);
  });

  it("searches beyond the first batch and retains only one page of all matching results", async () => {
    const result = await getSubmissionPage(await createClient(), [site], submissionFiltersSchema.parse({ q: "roof repair" }), now);
    expect(result.count).toBe(30);
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].id).toBe("480");
    expect(result.rows[24].id).toBe("504");
    expect(mocks.ranges).toEqual([[0, 499], [500, 999]]);
    const next = await getSubmissionPage(await createClient(), [site], submissionFiltersSchema.parse({ q: "roof repair", page: 2 }), now);
    expect(next.rows.map((row) => row.id)).toEqual(["505", "506", "507", "508", "509"]);
    mocks.rows = mocks.rows.map((row, index) => ({ ...row, data: { service: index < 500 ? "Painting" : "Plumbing" } }));
    const lateMatches = await getSubmissionPage(await createClient(), [site], submissionFiltersSchema.parse({ q: "plumbing" }), now);
    expect(lateMatches.count).toBe(10);
    expect(lateMatches.rows[0].id).toBe("500");
  });

  it("does not query without accessible sites and surfaces database failures", async () => {
    const client = await createClient();
    expect(await getSubmissionPage(client, [], submissionFiltersSchema.parse({}), now)).toEqual({ rows: [], count: 0 });
    expect(mocks.ranges).toEqual([]);
    mocks.error = { message: "unavailable" };
    await expect(getSubmissionPage(client, [site], submissionFiltersSchema.parse({}), now)).rejects.toBeInstanceOf(SubmissionQueryError);
  });
});
