import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), from: vi.fn(), connect: vi.fn(), context: vi.fn(), sync: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.requireAdmin }));
vi.mock("@/lib/social/connections", () => ({
  connectSocialAccount: mocks.connect, socialContext: mocks.context, syncSocialAccount: mocks.sync,
  socialUserError: (error: unknown) => error instanceof Error ? error.message : "Request failed",
}));
import { runSocialProviderTest } from "./actions";

const site = "70000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ supabase: { from: mocks.from } });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { account_id: "70000000-0000-4000-8000-000000000011" }, error: null,
  }) }) }) });
});

describe("agency social test actions", () => {
  it("denies non-admins before database or provider work", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Admin required"));
    await expect(runSocialProviderTest(site, { action: "reviews" })).rejects.toThrow("Admin required");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before publishing or replying", async () => {
    expect(await runSocialProviderTest(site, { action: "reply", reviewId: "review", comment: "Reply" })).toHaveProperty("error");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("resolves the selected site's account on the server", async () => {
    mocks.connect.mockResolvedValue({ data: { url: "https://app.upload-post.com/connect?token=private" }, raw: { access_url: "[redacted]" } });
    const result = await runSocialProviderTest(site, { action: "connect", accountId: "ignored" });
    expect(mocks.connect).toHaveBeenCalledWith("70000000-0000-4000-8000-000000000011");
    expect(result.connectUrl).toContain("/connect?");
    expect(result.raw).toEqual({ access_url: "[redacted]" });
  });
});
