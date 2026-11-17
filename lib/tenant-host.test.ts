import { afterEach, describe, expect, it, vi } from "vitest";
import { brand } from "./brand";
import { getTenantKeyFromHost } from "./tenant";

describe("tenant host resolution", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("maps root and www hosts to the marketing tenant and other hosts to their site", () => {
    vi.stubEnv("ROOT_DOMAIN", "sitomax.example");
    expect(getTenantKeyFromHost("sitomax.example")).toBe(brand.marketingSiteSubdomain);
    expect(getTenantKeyFromHost("www.sitomax.example:443")).toBe(brand.marketingSiteSubdomain);
    expect(getTenantKeyFromHost("client.sitomax.example")).toBe("client");
    expect(getTenantKeyFromHost("custom.example")).toBe("custom.example");
  });
});
