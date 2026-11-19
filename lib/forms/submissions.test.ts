import { describe, expect, it } from "vitest";
import { submissionContact, submissionFields, submissionFiltersSchema, submissionQueryString, submissionSearchMatches } from "./submissions";

describe("submission search and filters", () => {
  it("searches arbitrary nested answers without depending on contact field names", () => {
    const submission = {
      id: "submission", site_id: "site", form_name: "Custom intake", page_path: "/quote",
      data: { "Project goals": { services: ["Maintenance", "Installation"] }, budget: 1200 },
      created_at: "2026-11-01", is_read: false,
    };
    expect(submissionSearchMatches(submission, "INSTALLATION")).toBe(true);
    expect(submissionSearchMatches(submission, "1200")).toBe(true);
    expect(submissionSearchMatches(submission, "custom intake")).toBe(true);
    expect(submissionSearchMatches(submission, "Studio", { id: "site", name: "North Studio", subdomain: "north" })).toBe(true);
    expect(submissionSearchMatches(submission, "unknown")).toBe(false);
  });

  it("preserves arbitrary answers and only extracts recognized textual contact fields", () => {
    expect(submissionContact({ "Full Name": "Alex", email_address: "alex@example.test", custom: true })).toEqual({ name: "Alex", email: "alex@example.test" });
    expect(submissionContact({ name: ["not", "text"], email: { address: "private" } })).toEqual({ name: undefined, email: undefined });
    expect(submissionFields(["Choice A", "Choice B"])).toEqual([["Response", ["Choice A", "Choice B"]]]);
    expect(submissionFields(null)).toEqual([]);
  });

  it("validates query parameters and keeps active filters in export and pagination links", () => {
    const filters = submissionFiltersSchema.parse({ site: "00000000-0000-4000-8000-000000000001", q: " quote & repair ", days: "7", status: "new", page: "3" });
    const query = new URLSearchParams(submissionQueryString(filters).slice(1));
    expect(Object.fromEntries(query)).toEqual({ site: filters.site, q: "quote & repair", days: "7", status: "new" });
    expect(new URLSearchParams(submissionQueryString(filters, 4).slice(1)).get("page")).toBe("4");
    for (const invalid of [{ site: "not-a-site" }, { days: "10" }, { status: "deleted" }, { page: "0" }, { q: "x".repeat(201) }]) {
      expect(submissionFiltersSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
