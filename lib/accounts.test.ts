import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "./brand";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), admin: vi.fn(), rpc: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { getOrCreateInternalAccount, getSiteAccountOptions } from "./accounts";

const internalId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({
    user: { id: "super-admin" },
    supabase: { from: () => ({ select: () => ({ eq: mocks.eq }) }) },
  });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [{ id: "client", name: "A client", is_internal: false }], error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: internalId, error: null });
});

describe("internal agency account", () => {
  it("authorizes before calling the service-role account helper", async () => {
    mocks.authorize.mockRejectedValue(new Error("not authorized"));
    await expect(getOrCreateInternalAccount()).rejects.toThrow("not authorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("passes the authenticated super admin and agency name to the atomic helper", async () => {
    await expect(getOrCreateInternalAccount()).resolves.toBe(internalId);
    expect(mocks.rpc).toHaveBeenCalledWith("get_or_create_internal_account", {
      p_user_id: "super-admin", p_name: brand.name,
    });
  });

  it("puts the internal option first and queries only external clients", async () => {
    const options = await getSiteAccountOptions();
    expect(options.map((account) => account.name)).toEqual([`${brand.name} (internal)`, "A client"]);
    expect(mocks.eq).toHaveBeenCalledWith("is_internal", false);
  });

  it("surfaces initialization and account-list failures", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "missing_migration" } });
    await expect(getOrCreateInternalAccount()).rejects.toThrow("Apply migration 0019");
    mocks.order.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    await expect(getSiteAccountOptions()).rejects.toThrow("Could not load client accounts");
  });
});
