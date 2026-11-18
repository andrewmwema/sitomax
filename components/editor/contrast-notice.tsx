"use client";

import {
  bestContrastingTextColor,
  reviewContrast,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/theme/contrast";

export function ContrastNotice({
  foreground,
  backgrounds,
}: {
  foreground: unknown;
  backgrounds: readonly unknown[];
}) {
  const colors = backgrounds.filter((value): value is string => typeof value === "string");
  if (!colors.length) return null;
  const { issues } = reviewContrast(foreground, null, colors);
  if (!issues.length) return null;
  const worst = issues.reduce(
    (lowest, current) => current.ratio < lowest.ratio ? current : lowest,
    issues[0],
  );
  const suggestion = bestContrastingTextColor(colors);
  const suggestionPasses = suggestion
    ? reviewContrast(suggestion, null, colors).issues.length === 0
    : false;
  return (
    <p role="status" className="text-[11px] font-normal text-amber-800">
      Text contrast is {worst.ratio.toFixed(2)}:1; WCAG AA recommends{" "}
      {WCAG_AA_NORMAL_TEXT}:1.{" "}
      {suggestionPasses
        ? `Choose another text color (try ${suggestion}).`
        : "Add a stronger overlay or adjust the background; no single text color meets the threshold."}
    </p>
  );
}
