import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/lib/brand";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), lookup: vi.fn(), rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { checkSubdomain, createSite } from "./actions";

const input = {
  accountId: "00000000-0000-4000-8000-000000000001", template: "plumber",
  subdomain: "acme", businessName: "Acme", phone: "+1 555 123 4567",
  city: "Oak", services: "repairs", email: "hello@example.com", address: "42 Main",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }) } });
  mocks.lookup.mockResolvedValue({ data: { id: input.accountId }, error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: "00000000-0000-4000-8000-000000000002", error: null });
});
describe("site wizard actions", () => {
  it("checks permissions before checking availability or creating a site", async () => {
    mocks.authorize.mockRejectedValue(new Error("not authorized"));
    await expect(checkSubdomain("acme", input.accountId)).rejects.toThrow("not authorized");
    await expect(createSite(input)).rejects.toThrow("not authorized");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("checks availability and reports lookup errors", async () => {
    mocks.lookup.mockResolvedValueOnce({ data: { id: input.accountId }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await checkSubdomain("acme", input.accountId)).toMatchObject({ available: true });
    expect(await checkSubdomain("www", input.accountId)).toMatchObject({ available: false });
    mocks.lookup.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect(await checkSubdomain("acme", input.accountId)).toMatchObject({ available: false, message: expect.stringContaining("retry") });
  });
  it("creates four fully instantiated pages through one atomic RPC", async () => {
    expect(await createSite(input)).toMatchObject({ status: "success" });
    const [name, params] = mocks.rpc.mock.calls[0];
    expect(name).toBe("create_template_site");
    expect(params.p_pages.map((page: { slug: string }) => page.slug)).toEqual(["", "about", "services", "contact"]);
    expect(params.p_timezone).toBe("UTC");
    expect(JSON.stringify(params.p_pages)).toContain("Acme");
    expect(JSON.stringify(params.p_pages)).not.toContain("{{");
  });
  it("rejects invalid input, missing clients and duplicate subdomains", async () => {
    expect(await createSite({ ...input, subdomain: "www" })).toMatchObject({ status: "error" });
    expect(await createSite({ ...input, subdomain: "api" })).toMatchObject({ status: "error" });
    expect(await createSite({ ...input, timezone: "Not/A_Timezone" })).toMatchObject({ status: "error", message: expect.stringContaining("timezone") });
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    expect(await createSite(input)).toMatchObject({ status: "error" });
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    expect(await createSite(input)).toMatchObject({ status: "error", message: expect.stringContaining("already in use") });
  });
  it("rejects marketing hostnames for client accounts even for a super admin", async () => {
    expect(await createSite({ ...input, subdomain: brand.marketingSiteSubdomain })).toMatchObject({ status: "error", message: expect.stringContaining("reserved") });
    expect(await checkSubdomain(brand.marketingSiteSubdomain, input.accountId)).toMatchObject({ available: false });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("allows the super admin to create the configured marketing tenant in the internal account", async () => {
    mocks.lookup.mockResolvedValue({ data: { id: input.accountId, is_internal: true }, error: null });
    expect(await createSite({ ...input, subdomain: brand.marketingSiteSubdomain })).toMatchObject({ status: "success" });
    expect(mocks.rpc.mock.calls[0][1].p_subdomain).toBe(brand.marketingSiteSubdomain);
    mocks.lookup.mockResolvedValueOnce({ data: { id: input.accountId, is_internal: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await checkSubdomain(brand.marketingSiteSubdomain, input.accountId)).toMatchObject({ available: true });
  });
});
