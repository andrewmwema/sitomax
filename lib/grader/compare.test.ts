import { describe, expect, it } from "vitest";
import { compareGraderScores } from "./compare";

const base = {
  scores: { overall: 62, grade: "C", categories: { speed: 40, mobile: 90, seo: 70, security: 100, conversion: 50, local: null, social: 80, accessibility: 20 } },
  results: { checks: [
    { id: "mobile_tbt", category: "speed" as const, status: "fail" as const, value: 900, detail: "Slow.", fix: "Reduce scripts." },
    { id: "cta", category: "conversion" as const, status: "warn" as const, value: null, detail: "No CTA.", fix: "Add one." },
  ] },
};
const competitor = { scores: { overall: 81, grade: "B", categories: { speed: 85, mobile: 80, seo: 75, security: 100, conversion: 80, local: 90, social: 80, accessibility: 100 } } };

describe("compareGraderScores", () => {
  it("lists scored categories and ranks the largest competitor leads as gaps", () => {
    const result = compareGraderScores(base, competitor);
    expect(result.overall).toEqual({ base: 62, competitor: 81, diff: 19 });
    expect(result.rows.map((row) => row.key)).not.toContain("accessibility");
    expect(result.rows.find((row) => row.key === "local")).toMatchObject({ base: null, competitor: 90, diff: null });
    expect(result.gaps.map((gap) => [gap.key, gap.diff])).toEqual([["speed", 45], ["conversion", 30], ["seo", 5]]);
    expect(result.gaps[0].fix).toBe("Mobile responsiveness (Total Blocking Time)");
    expect(result.gaps[2].fix).toBeNull();
  });

  it("returns no gaps when the base site leads everywhere or scores are missing", () => {
    expect(compareGraderScores(competitor, base).gaps.map((gap) => gap.key)).toEqual(["mobile"]);
    expect(compareGraderScores({ scores: null }, competitor)).toMatchObject({ gaps: [], overall: { diff: null } });
  });
});
