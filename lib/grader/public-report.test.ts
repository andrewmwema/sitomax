import { describe, expect, it } from "vitest";
import { publicReportSchema } from "./public-report";

const teaser = {
  slug: "example-0123456789abcdef", url: "https://example.com/", domain: "example.com",
  status: "complete", progress: {}, scores: null, screenshot_url: null, unlocked: false,
  headline: null, top_issues: null,
};

describe("public grader report contract", () => {
  it("accepts a teaser without full results", () => {
    expect(publicReportSchema.safeParse(teaser).success).toBe(true);
  });
  it("rejects a locked response containing full results", () => {
    expect(publicReportSchema.safeParse({ ...teaser, results: null }).success).toBe(false);
  });
  it("requires the full response fields after unlock", () => {
    expect(publicReportSchema.safeParse({ ...teaser, unlocked: true }).success).toBe(false);
    expect(publicReportSchema.safeParse({ ...teaser, unlocked: true, results: null, ai_summary: null }).success).toBe(true);
  });
});
