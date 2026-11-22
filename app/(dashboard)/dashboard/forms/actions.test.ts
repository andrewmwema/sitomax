import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ update: () => ({ eq: mocks.eq }) }),
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { markLeadViewed, markSubmissionRead } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
});
describe("mark submission read", () => {
  it("revalidates the dashboard only after an authorized update", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "00000000-0000-4000-8000-000000000001" }], error: null });
    const form = new FormData(); form.set("id", "00000000-0000-4000-8000-000000000001");
    expect(await markSubmissionRead({ error: "" }, form)).toEqual({ error: "" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
  });

  describe("automatically mark a lead viewed", () => {
    it("only clears unread state if the last activity is unchanged", async () => {
      mocks.select.mockResolvedValue({ data: [{ id: "00000000-0000-4000-8000-000000000001" }], error: null });
      expect(await markLeadViewed({ id: "00000000-0000-4000-8000-000000000001", lastActivity: "2026-01-02T00:00:00Z" })).toEqual({ error: "" });
      expect(mocks.eq).toHaveBeenCalledWith("last_activity_at", "2026-01-02T00:00:00Z");
      expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
    });
    it("reports a changed or inaccessible lead instead of clearing a newer reply", async () => {
      mocks.select.mockResolvedValue({ data: [], error: null });
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await markLeadViewed({ id: "00000000-0000-4000-8000-000000000001", lastActivity: "2026-01-02T00:00:00Z" })).error).toContain("Refresh");
      expect(mocks.revalidate).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });
  it("does not claim success when RLS excludes the row", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const form = new FormData(); form.set("id", "00000000-0000-4000-8000-000000000001");
    expect((await markSubmissionRead({ error: "" }, form)).error).toContain("Could not");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
