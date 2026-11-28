import { groupCategoryChecks } from "./check-presentation";
import { graderCategories } from "./presentation";
import type { Category, CheckStatus } from "./types";

type Scores = { overall: number | null; grade: string | null; categories: Record<string, number | null> } | null | undefined;
type ComparableCheck = { id: string; category: Category; status: CheckStatus; value: string | number | null; detail: string; fix: string };
type Comparable = { scores?: Scores; results?: { checks: ComparableCheck[] } | null };

export type GraderCompareRow = { key: Category; label: string; base: number | null; competitor: number | null; diff: number | null };
export type GraderGap = { key: Category; label: string; base: number; competitor: number; diff: number; fix: string | null };

export type GraderComparison = {
  overall: { base: number | null; competitor: number | null; diff: number | null };
  rows: GraderCompareRow[];
  gaps: GraderGap[];
};

const diff = (base: number | null, competitor: number | null) =>
  base === null || competitor === null ? null : competitor - base;

/**
 * Compares two scans category by category. Gaps are the scored categories where the competitor is ahead,
 * largest first, each with the base site's most important finding in that category when available.
 * Accessibility is excluded because it is not part of the overall score.
 */
export function compareGraderScores(base: Comparable, competitor: Comparable, limit = 3): GraderComparison {
  const rows = graderCategories.filter(([key]) => key !== "accessibility").map(([key, label]) => {
    const a = base.scores?.categories[key] ?? null;
    const b = competitor.scores?.categories[key] ?? null;
    return { key, label, base: a, competitor: b, diff: diff(a, b) };
  });
  const gaps = rows.flatMap((row) => row.base !== null && row.competitor !== null && row.diff !== null && row.diff > 0
    ? [{ key: row.key, label: row.label, base: row.base, competitor: row.competitor, diff: row.diff,
      fix: base.results ? (groupCategoryChecks(base.results.checks, row.key).findings[0]?.label ?? null) : null }]
    : []).sort((a, b) => b.diff - a.diff).slice(0, limit);
  const overallBase = base.scores?.overall ?? null;
  const overallCompetitor = competitor.scores?.overall ?? null;
  return { overall: { base: overallBase, competitor: overallCompetitor, diff: diff(overallBase, overallCompetitor) }, rows, gaps };
}
