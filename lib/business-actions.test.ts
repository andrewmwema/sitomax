import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  supabase: { from: () => ({ update: mocks.update }) },
}) }));
import { saveBusinessInfo } from "./business-actions";
import { businessSchema, emptyBusiness } from "./business";

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

  it("accepts and preserves optional intake fields without adding them to older sites", async () => {
    expect(businessSchema.parse(emptyBusiness)).toEqual(emptyBusiness);
    const business = {
      ...emptyBusiness, primaryAction: "book", audiences: ["Homeowners"],
      description: "Local repairs", socialLinks: [{ label: "Photos", url: "https://example.com/photos" }],
    };
    expect(businessSchema.parse(business)).toEqual(business);
    await expect(saveBusinessInfo(siteId, business)).resolves.toMatchObject({ status: "success", business });
    expect(mocks.update).toHaveBeenCalledWith({ business });
  });

  it("rejects malformed or unknown intake fields", () => {
    for (const fields of [
      { primaryAction: "unknown" }, { audiences: [""] }, { audiences: Array(11).fill("Homeowners") },
      { description: "x".repeat(4001) }, { socialLinks: [{ label: "Photos", url: "javascript:alert(1)" }] },
      { unexpected: "value" },
    ]) {
      expect(businessSchema.safeParse({ ...emptyBusiness, ...fields }).success).toBe(false);
    }
  });
});
