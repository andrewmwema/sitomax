import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), allowed: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "user" }, supabase: { rpc: mocks.rpc } }) }));
vi.mock("@/lib/forms/queries", () => ({ allowedLeadSites: mocks.allowed, getSubmissionPage: mocks.page }));
import { fetchLeadInbox } from "./actions";

const site = "00000000-0000-4000-8000-000000000002";
const row = (n: number, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, site_id: site, status: "new", archived: false,
  created_at: "2026-11-01T10:00:00+00:00", last_activity_at: "2026-11-01T10:00:00.123456+00:00", ...extra,
});
const counts = { needs_reply: 2, waiting: 0, all_open: 2, starred: 0, won: 0, lost: 0, archived: 0, trash: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lead inbox pages", () => {
  it("loads a page with counts and reports whether more leads follow", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "lead_inbox_counts" ? { data: counts, error: null } : { data: [row(1), row(2)], error: null });
    const result = await fetchLeadInbox({ view: "waiting", q: " boiler ", site, limit: 2, counts: true });
    expect(mocks.rpc).toHaveBeenCalledWith("lead_inbox_view", {
      p_view: "waiting", p_site_id: site, p_search: "boiler", p_cursor_at: null, p_cursor_id: null, p_limit: 2,
    });
    expect(result).toMatchObject({ hasMore: true, counts });
    expect(result.error).toBeUndefined();
  });

  it("continues from the last lead with the database's exact timestamp", async () => {
    mocks.rpc.mockResolvedValue({ data: [row(3)], error: null });
    const cursor = { at: "2026-11-01T10:00:00.123456+00:00", id: row(2).id };
    const result = await fetchLeadInbox({ view: "all_open", cursor, limit: 50 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("lead_inbox_view", expect.objectContaining({ p_cursor_at: cursor.at, p_cursor_id: cursor.id }));
    expect(result).toMatchObject({ hasMore: false, counts: null });
  });

  it("rejects malformed views and cursors before querying", async () => {
    expect(await fetchLeadInbox({ view: "everything" })).toEqual({ error: "Choose a valid lead view or search." });
    expect(await fetchLeadInbox({ view: "trash", cursor: { at: "yesterday", id: row(1).id } })).toEqual({ error: "Choose a valid lead view or search." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("falls back to the plain query for the first page only", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    mocks.allowed.mockResolvedValue([{ id: site, name: "Site", subdomain: "site" }]);
    mocks.page.mockResolvedValue({ count: 2, rows: [row(1), row(2, { status: "won" })] });
    expect(await fetchLeadInbox({ view: "needs_reply" })).toMatchObject({ rows: [row(1)], hasMore: false });
    expect(await fetchLeadInbox({ view: "needs_reply", cursor: { at: "2026-11-01T10:00:00Z", id: row(1).id } }))
      .toEqual({ error: "Could not load more leads. Refresh the inbox and try again." });
  });
});
