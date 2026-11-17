import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  supabase: { from: () => ({ update: mocks.update }) },
}) }));
import { saveBusinessInfo } from "./business-actions";
import { emptyBusiness } from "./business";

const siteId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockReturnValue({ eq: () => ({ select: mocks.select }) });
  mocks.select.mockResolvedValue({ data: [{ id: siteId }], error: null });
});

describe("business information", () => {
  it("validates before saving and uses the user-scoped site update", async () => {
    const business = { ...emptyBusiness, businessName: "Example", services: ["Repairs"], email: "hello@example.com" };
    await expect(saveBusinessInfo(siteId, business)).resolves.toMatchObject({ status: "success", business });
    expect(mocks.update).toHaveBeenCalledWith({ business });
    mocks.update.mockClear();
    await expect(saveBusinessInfo(siteId, { ...business, email: "not-an-email" })).resolves.toMatchObject({ status: "error" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports an inaccessible site instead of claiming it was saved", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveBusinessInfo(siteId, emptyBusiness)).resolves.toMatchObject({ status: "error" });
    vi.restoreAllMocks();
  });
});
