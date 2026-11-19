import { describe, expect, it } from "vitest";
import { siteDateTimeInput, siteLocalTimeToUtc } from "./blog-date";

describe("site timezone scheduling", () => {
  it("converts site-local scheduling values to UTC", () => {
    expect(siteLocalTimeToUtc("2026-01-15T12:30", "America/New_York")).toBe("2026-01-15T17:30:00.000Z");
  });

  it("rejects malformed, invalid-zone, and daylight-saving gap times", () => {
    expect(siteLocalTimeToUtc("2026-13-15T12:30", "UTC")).toBeNull();
    expect(siteLocalTimeToUtc("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(siteLocalTimeToUtc("2026-01-15T12:30", "Not/A_Timezone")).toBeNull();
  });

  it("formats the value expected by a site-local datetime input", () => {
    expect(siteDateTimeInput(new Date("2026-01-15T17:30:00.000Z"), "America/New_York")).toBe("2026-01-15T12:30");
  });
});
