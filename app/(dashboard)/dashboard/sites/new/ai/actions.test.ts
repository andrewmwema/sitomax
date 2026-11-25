import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { rpc: mocks.rpc } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { restoreAiDrafts } from "./actions";

const siteId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("restore AI drafts", () => {
  it("restores only the requested site's version and refreshes that site", async () => {
    expect(await restoreAiDrafts({ siteId, versionId })).toEqual({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith("restore_ai_draft_version", {
      p_site_id: siteId, p_version_id: versionId,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/sites/${siteId}`);
  });

  it("reports database failures without refreshing", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    expect(await restoreAiDrafts({ siteId, versionId })).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
