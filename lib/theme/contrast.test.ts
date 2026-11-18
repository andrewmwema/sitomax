import { describe, expect, it } from "vitest";
import {
  assessContrast,
  bestContrastingTextColor,
  contrastRatio,
  contrastWarning,
  nearestContrast,
  resolveContrastBackgrounds,
  reviewContrast,
} from "./contrast";
import { buildThemeStyle } from "./presets";

describe("shared contrast helpers", () => {
  it("calculates WCAG contrast and checks the normal-text threshold", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21);
    expect(assessContrast("#000000", "#ffffff")).toMatchObject({
      ratio: 21,
      minimum: 4.5,
      passes: true,
    });
    expect(assessContrast("#777777", "#ffffff")?.passes).toBe(false);
    expect(assessContrast("red", "#ffffff")).toBeNull();
  });

  it("selects the candidate with the best worst-case contrast for gradients", () => {
    expect(bestContrastingTextColor(["#020617", "#1e293b"])).toBe("#ffffff");
    expect(bestContrastingTextColor(["#f8fafc", "#ffffff"])).toBe("#17202b");
    expect(bestContrastingTextColor(["#000000", "#ffffff"])).toBe("#17202b");
  });

  it("keeps a preferred foreground close while correcting it to pass", () => {
    const adjusted = nearestContrast("#777777", ["#ffffff"]);
    expect(adjusted).not.toBeNull();
    expect(contrastRatio(adjusted!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(adjusted).toBe("#767676");
    expect(nearestContrast("#777777", ["#000000", "#ffffff"], 7)).toBeNull();
  });

  it("resolves solid and gradient design surfaces, then inherited surfaces for media", () => {
    expect(resolveContrastBackgrounds({
      background: { type: "gradient", from: "#abc", to: "#def" },
      appearance: { mobile: { backgroundColor: "#ffffff" } },
    })).toEqual(["#aabbcc", "#ddeeff", "#ffffff"]);
    expect(resolveContrastBackgrounds(
      { background: { type: "image" } },
      ["#123456"],
    )).toEqual(["#123456"]);
    expect(reviewContrast("#777777", { background: { type: "color", color: "#ffffff" } }).issues)
      .toHaveLength(1);
  });

  it("returns a warning only when a valid pair misses the threshold", () => {
    expect(contrastWarning("#17202b", "#ffffff")).toBeNull();
    expect(contrastWarning("#777777", "#ffffff")).toContain("4.48:1");
    expect(contrastWarning("not-a-color", "#ffffff")).toBeNull();
  });

  it("provides accessible foregrounds for the shared theme surfaces", () => {
    const style = buildThemeStyle({
      colors: { primary: "#fbbf24", background: "#ffffff" },
    }) as Record<string, string>;
    expect(contrastRatio(style["--color-on-primary"], "#fbbf24")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--color-on-bg"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--color-on-soft-bg"], "#fdf7e5")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--color-on-dark-bg"], style["--color-dark-bg"])).toBeGreaterThanOrEqual(4.5);
  });
});
