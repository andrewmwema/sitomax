import { GRADER_WEIGHTS } from "./config";
import { CATEGORIES, type Category, type Check } from "./types";

export function scoreChecks(checks: Check[]) {
  const categories = Object.fromEntries(CATEGORIES.map((category) => {
    const known = checks.filter((check) => check.category === category && check.status !== "unknown");
    const points = known.reduce((sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0), 0);
    return [category, known.length ? Math.round(points * 100 / known.length) : null];
  })) as Record<Category, number | null>;
  let total = 0;
  let weight = 0;
  for (const [category, value] of Object.entries(GRADER_WEIGHTS)) {
    const score = categories[category as Category];
    if (score !== null && value !== undefined) {
      total += score * value;
      weight += value;
    }
  }
  const overall = weight ? Math.round(total / weight) : null;
  const grade = overall === null ? null : overall >= 90 ? "A" : overall >= 80 ? "B"
    : overall >= 70 ? "C" : overall >= 60 ? "D" : "F";
  return { overall, grade, categories };
}
