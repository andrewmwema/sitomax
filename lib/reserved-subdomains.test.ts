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

  it("allows only the super admin to use the marketing hostname", () => {
    expect(isReservedForAccountSite(brand.marketingSiteSubdomain, true)).toBe(false);
    expect(isReservedForAccountSite("app", true)).toBe(true);
    expect(subdomainSchema.safeParse(brand.marketingSiteSubdomain).success).toBe(true);
    expect(subdomainSchema.safeParse("client-site").success).toBe(true);
  });

  it("allows an explicitly configured reserved marketing hostname in the agency flows only", () => {
    expect(createSubdomainSchema("app").safeParse("app").success).toBe(true);
    expect(createSiteCreationSchema("app").shape.subdomain.safeParse("app").success).toBe(true);
    expect(createGenerationInputSchema("app").shape.subdomain.safeParse("app").success).toBe(true);
    expect(createSubdomainSchema().safeParse("app").success).toBe(false);
  });
});
