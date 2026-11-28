import { describe, expect, it } from "vitest";
import { graderCheckLabel, graderCheckWhy, graderPriorities, groupCategoryChecks, presentCheck } from "./check-presentation";
import { profileCheck, unknownHtmlChecks } from "./html";
import { pageSpeedChecks } from "./pagespeed";
import type { Check } from "./types";

const check = (overrides: Partial<Check> & Pick<Check, "id">): Check => ({
  category: "seo", status: "warn", value: null, detail: "Detail.", fix: "Fix it.", ...overrides,
});

describe("grader check presentation", () => {
  it("has a human label for every check the scanners produce", () => {
    const ids = [...unknownHtmlChecks(), profileCheck({ url: "https://example.com" }),
      ...pageSpeedChecks(null, "mobile"), ...pageSpeedChecks(null, "desktop"),
      "mobile_inp", "desktop_inp", "tls", "https_enforced", "robots_txt", "sitemap",
      "places_rating", "places_reviews", "places_phone", "places_address"].map((item) => typeof item === "string" ? item : item.id);
    expect(ids.filter((id) => graderCheckWhy(id) === null)).toEqual([]);
    expect(graderCheckLabel("mobile_tbt")).toBe("Mobile responsiveness (Total Blocking Time)");
    expect(graderCheckLabel("tls")).toBe("Secure certificate (SSL)");
  });

  it("shows found values only when they add information and rewrites internal wording", () => {
    expect(presentCheck(check({ id: "phone", value: "Found", detail: "Found a phone number." })).found).toBeNull();
    expect(presentCheck(check({ id: "title", value: "Home - Acme", detail: "26 characters." })).found).toBe("Home - Acme");
    const speed = presentCheck(check({ id: "mobile_performance", category: "speed", value: 72,
      detail: "mobile performance PageSpeed score: 72/100.", fix: "Review the mobile performance Lighthouse recommendations." }));
    expect(speed).toMatchObject({ found: null, detail: "Google PageSpeed scored this 72/100.",
      fix: "Work through Google PageSpeed's recommendations for mobile speed." });
    expect(presentCheck(check({ id: "open_graph", value: 0, detail: "0 of the Open Graph title, description and image tags were found." })).detail)
      .toBe("0 of 3 social sharing tags (title, description and image) were found.");
    expect(presentCheck(check({ id: "title", status: "pass" })).fix).toBeNull();
  });

  it("orders issues before needs-work, groups couldn't-check reasons and collapses passes", () => {
    const grouped = groupCategoryChecks([
      check({ id: "title", status: "pass" }),
      check({ id: "description", status: "warn" }),
      check({ id: "h1", status: "fail" }),
      check({ id: "sitemap", status: "unknown", detail: "Couldn't reach it." }),
      check({ id: "robots", status: "unknown", detail: "Couldn't reach it." }),
      check({ id: "tls", category: "security", status: "fail" }),
    ], "seo");
    expect(grouped.findings.map((item) => item.id)).toEqual(["h1", "description"]);
    expect(grouped.unknown).toEqual([{ reason: "Couldn't reach it.", labels: [graderCheckLabel("sitemap"), graderCheckLabel("robots")] }]);
    expect(grouped.passed.map((item) => item.id)).toEqual(["title"]);
  });

  it("ranks priorities by status then weight and skips mobile/desktop duplicates", () => {
    const priorities = graderPriorities([
      check({ id: "open_graph", category: "social", status: "warn" }),
      check({ id: "mobile_lcp", category: "speed", status: "fail" }),
      check({ id: "desktop_lcp", category: "speed", status: "fail" }),
      check({ id: "address", category: "local", status: "fail" }),
      check({ id: "title", status: "pass" }),
    ]);
    expect(priorities.map((item) => item.id)).toEqual(["mobile_lcp", "address", "open_graph"]);
    expect(priorities.every((item) => item.why.length > 0)).toBe(true);
  });
});
