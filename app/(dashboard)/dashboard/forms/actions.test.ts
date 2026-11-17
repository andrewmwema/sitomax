import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ update: () => ({ eq: () => ({ select: mocks.select }) }) }),
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { markSubmissionRead } from "./actions";

beforeEach(() => { vi.clearAllMocks(); });
describe("mark submission read", () => {
  it("revalidates the dashboard only after an authorized update", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "00000000-0000-4000-8000-000000000001" }], error: null });
    const form = new FormData(); form.set("id", "00000000-0000-4000-8000-000000000001");
    expect(await markSubmissionRead({ error: "" }, form)).toEqual({ error: "" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
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
