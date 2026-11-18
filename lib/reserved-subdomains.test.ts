import { describe, expect, it } from "vitest";
import { brand } from "./brand";
import { RESERVED_SUBDOMAINS, isReservedForAccountSite, isReservedSubdomain } from "./reserved-subdomains";
import { createSiteCreationSchema, createSubdomainSchema, subdomainSchema } from "./site-creation";
import { createGenerationInputSchema } from "./ai/site-input";

describe("reserved site subdomains", () => {
  it("rejects every platform hostname and the configured marketing hostname from client use", () => {
    for (const subdomain of RESERVED_SUBDOMAINS) {
      expect(subdomainSchema.safeParse(subdomain).success).toBe(false);
      expect(isReservedSubdomain(subdomain)).toBe(true);
    }
    expect(isReservedSubdomain(brand.marketingSiteSubdomain)).toBe(true);
    expect(isReservedForAccountSite(brand.marketingSiteSubdomain, false)).toBe(true);
  });

  it("allows the marketing hostname only for a super admin's internal account", () => {
    expect(isReservedForAccountSite(brand.marketingSiteSubdomain, true, true)).toBe(false);
    expect(isReservedForAccountSite(brand.marketingSiteSubdomain, true, false)).toBe(true);
    expect(isReservedForAccountSite(brand.marketingSiteSubdomain, false, true)).toBe(true);
    expect(isReservedForAccountSite("app", true, true)).toBe(true);
    expect(subdomainSchema.safeParse(brand.marketingSiteSubdomain).success).toBe(false);
    expect(subdomainSchema.safeParse("client-site").success).toBe(true);
  });

  it("allows an explicitly configured reserved marketing hostname in internal flows only", () => {
    expect(createSubdomainSchema("app", true).safeParse("app").success).toBe(true);
    expect(createSiteCreationSchema("app", true).shape.subdomain.safeParse("app").success).toBe(true);
    expect(createGenerationInputSchema("app", true).shape.subdomain.safeParse("app").success).toBe(true);
    expect(createSubdomainSchema("app").safeParse("app").success).toBe(false);
    expect(createSubdomainSchema("custom-marketing").safeParse("custom-marketing").success).toBe(false);
    expect(createSubdomainSchema("custom-marketing", true).safeParse("custom-marketing").success).toBe(true);
    expect(createSubdomainSchema().safeParse("app").success).toBe(false);
  });
});
