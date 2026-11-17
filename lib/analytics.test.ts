import { describe, expect, it } from "vitest";
import { deviceFromUserAgent, referrerOrigin } from "./analytics";

describe("analytics classification", () => {
  it("classifies common device agents", () => {
    expect(deviceFromUserAgent("Mozilla iPad")).toBe("tablet");
    expect(deviceFromUserAgent("Android Mobile")).toBe("mobile");
    expect(deviceFromUserAgent("Android")).toBe("tablet");
    expect(deviceFromUserAgent("Mozilla Windows")).toBe("desktop");
  });
  it("retains only external HTTP origins", () => {
    expect(referrerOrigin("https://example.com/a?token=x", "site.test")).toBe("https://example.com");
    expect(referrerOrigin("https://site.test/a", "site.test")).toBeNull();
    expect(referrerOrigin("javascript:alert(1)", "site.test")).toBeNull();
  });
});
