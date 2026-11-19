import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = { select: mocks.select, eq: () => query, maybeSingle: mocks.lookup };
    mocks.select.mockReturnValue(query);
    return { from: () => query };
  },
}));
import { getSiteByHost } from "./tenant";

beforeEach(() => vi.resetAllMocks());

it("retains legacy Navigation rendering until the migration is installed, including verified custom domains", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const legacy = { id: "site", subdomain: "example" };
  mocks.lookup.mockResolvedValueOnce({ data: null, error: { code: "42703", message: "column sites.draft_header does not exist" } })
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: legacy, error: null });
  expect(await getSiteByHost("example.invalid")).toEqual({ ...legacy, headers_ready: false });
  expect(mocks.select.mock.calls[0][0]).toContain("draft_header");
  expect(mocks.select.mock.calls[1][0]).not.toContain("draft_header");
  expect(mocks.select.mock.calls[2][0]).not.toContain("draft_header");
  expect(warning).toHaveBeenCalledOnce();
  warning.mockRestore();
});

it("does not mistake unrelated database errors for missing migrations or missing sites", async () => {
  mocks.lookup.mockResolvedValue({ data: null, error: { code: "42501", message: "Permission denied" } });
  await expect(getSiteByHost("example")).rejects.toThrow("Unable to load the site.");
  expect(mocks.lookup).toHaveBeenCalledOnce();
});
