import { describe, expect, it } from "vitest";
import { scoreChecks } from "./scoring";
import type { Check } from "./types";

function check(category: Check["category"], status: Check["status"]): Check {
  return { id: `${category}-${status}`, category, status, value: null, detail: "", fix: "" };
}

describe("grader scoring", () => {
  it("excludes unknown checks and renormalizes missing categories", () => {
    const scores = scoreChecks([
      check("speed", "pass"), check("speed", "unknown"), check("seo", "fail"),
      check("conversion", "warn"), check("accessibility", "fail"),
    ]);
    expect(scores.categories).toMatchObject({ speed: 100, seo: 0, conversion: 50, mobile: null, accessibility: 0 });
    expect(scores.overall).toBe(50);
    expect(scores.grade).toBe("F");
  });

  it("returns no grade when all weighted categories are unknown", () => {
    expect(scoreChecks([check("speed", "unknown"), check("accessibility", "pass")]))
      .toMatchObject({ overall: null, grade: null });
  });

  it.each([[90, "A"], [80, "B"], [70, "C"], [60, "D"], [50, "F"]])(
    "grades %i as %s", (score, grade) => {
      const checks = Array.from({ length: 10 }, (_, index) =>
        check("speed", index < score / 10 ? "pass" : "fail"));
      expect(scoreChecks(checks).grade).toBe(grade);
    },
  );
});
