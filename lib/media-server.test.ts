import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), rpc: vi.fn(), admin: vi.fn(), internal: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }), rpc: mocks.rpc,
  } }),
  requireSuperAdmin: mocks.admin,
}));
vi.mock("@/lib/accounts", () => ({ getOrCreateInternalAccount: mocks.internal }));
import { mediaAccess } from "./media-server";

const siteId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ data: { id: siteId }, error: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});
describe("media access", () => {
  it("uses site RLS access and fails closed if access or role verification fails", async () => {
    expect(await mediaAccess({ siteId })).toMatchObject({ siteId, isAdmin: false });
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    await expect(mediaAccess({ siteId })).rejects.toThrow("unavailable");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "failure" } });
    await expect(mediaAccess({ siteId })).rejects.toThrow("verify access");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("authorizes agency scope before creating or reading its internal folder", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Admin required"));
    await expect(mediaAccess({ agency: true })).rejects.toThrow("Admin required");
    expect(mocks.internal).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValueOnce({ supabase: {} });
    mocks.internal.mockResolvedValueOnce(siteId);
    expect(await mediaAccess({ agency: true })).toMatchObject({ siteId, isAdmin: true });
    await expect(mediaAccess({ siteId, agency: true })).rejects.toThrow();
  });
});
