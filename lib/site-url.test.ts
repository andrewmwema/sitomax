import { describe, expect, it } from "vitest";
import { brand } from "./brand";
import { getSiteUrl } from "./site-url";

describe("public site URLs", () => {
  it("uses the apex for the marketing tenant and subdomains for client sites", () => {
    const root = { custom_domain: null, domain_verified: false };
    expect(getSiteUrl({ ...root, subdomain: brand.marketingSiteSubdomain })).toBe(`https://${brand.rootDomain}`);
    expect(getSiteUrl({ ...root, subdomain: "client" })).toBe(`https://client.${brand.rootDomain}`);
  });

  it("uses the apex for the explicitly configured marketing tenant", () => {
    expect(getSiteUrl({ subdomain: "app", custom_domain: null, domain_verified: false }, "app"))
      .toBe(`https://${brand.rootDomain}`);
  });
});
