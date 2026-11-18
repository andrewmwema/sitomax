/** WCAG 2.x contrast thresholds for normal and large text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;

export type ContrastAssessment = {
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  passes: boolean;
};

function parseHexColor(color: string): [number, number, number] {
  let value = color.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    throw new TypeError("Expected a 3- or 6-digit hex color.");
  }
  if (value.length === 3) value = [...value].map((channel) => channel + channel).join("");
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  );
  return [channels[0], channels[1], channels[2]];
}

function formatHexColor([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseHexColor(color).map((channel) => {
    const linear = channel / 255;
    return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG relative contrast ratio between two hex colors, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Return a ratio and pass/fail result, or null when either color is not hex. */
export function assessContrast(
  foreground: unknown,
  background: unknown,
  minimum = WCAG_AA_NORMAL_TEXT,
): ContrastAssessment | null {
  if (
    typeof foreground !== "string" ||
    typeof background !== "string" ||
    !Number.isFinite(minimum) ||
    minimum < 1
  ) {
    return null;
  }
  try {
    const ratio = contrastRatio(foreground, background);
    return {
      foreground,
      background,
      ratio,
      minimum,
      passes: ratio >= minimum,
    };
  } catch {
    return null;
  }
}

/**
 * Select the candidate with the highest worst-case ratio across all
 * backgrounds. This works for gradients as well as solid surfaces.
 */
export function bestContrastingTextColor(
  backgrounds: readonly string[],
  candidates: readonly string[] = ["#ffffff", "#17202b"],
  minimum = WCAG_AA_NORMAL_TEXT,
): string | null {
  if (!backgrounds.length || !candidates.length || !Number.isFinite(minimum) || minimum < 1) {
    return null;
  }
  let best: { color: string; ratio: number } | null = null;
  for (const candidate of candidates) {
    const ratios = backgrounds.map((background) => assessContrast(candidate, background, minimum));
    if (ratios.some((result) => result === null)) continue;
    const ratio = Math.min(...ratios.map((result) => result!.ratio));
    if (!best || ratio > best.ratio) best = { color: candidate, ratio };
  }
  return best?.color ?? null;
}

/**
 * Find the closest shade to a preferred foreground that meets the minimum
 * ratio against every supplied surface. The search preserves the preferred
 * hue by moving toward black or white; null means no common compliant shade.
 */
export function nearestContrast(
  foreground: string,
  backgrounds: readonly string[],
  minimum = WCAG_AA_NORMAL_TEXT,
): string | null {
  if (!backgrounds.length || !Number.isFinite(minimum) || minimum < 1) return null;
  let original: [number, number, number];
  try {
    original = parseHexColor(foreground);
  } catch {
    return null;
  }
  if (backgrounds.some((background) => !assessContrast("#000000", background, minimum))) {
    return null;
  }
  if (backgrounds.every((background) => assessContrast(foreground, background, minimum)?.passes)) {
    return formatHexColor(original);
  }

  let nearest: { color: string; distance: number } | null = null;
  for (const endpoint of [[0, 0, 0], [255, 255, 255]] as const) {
    for (let step = 1; step <= 255; step++) {
      const ratio = step / 255;
      const candidate = formatHexColor(original.map((channel, index) =>
        channel + (endpoint[index] - channel) * ratio,
      ) as [number, number, number]);
      if (!backgrounds.every((background) => assessContrast(candidate, background, minimum)?.passes)) {
        continue;
      }
      const [red, green, blue] = parseHexColor(candidate);
      const distance = Math.hypot(
        red - original[0],
        green - original[1],
        blue - original[2],
      );
      if (!nearest || distance < nearest.distance) nearest = { color: candidate, distance };
      break;
    }
  }
  return nearest?.color ?? null;
}

/**
 * Resolve the known solid-color stops in a stored block design. A caller
 * traversing nested blocks can pass inherited surfaces as fallbacks; media
 * backgrounds intentionally use those fallbacks because their pixels are
 * unknowable before rendering.
 */
export function resolveContrastBackgrounds(
  design: unknown,
  fallbacks: readonly unknown[] = [],
): string[] {
  if (!design || typeof design !== "object") {
    return [...new Set(fallbacks.filter(isHexColor).map((color) => formatHexColor(parseHexColor(color))))];
  }
  const source = design as {
    background?: { type?: unknown; color?: unknown; from?: unknown; to?: unknown };
    appearance?: Record<string, { backgroundColor?: unknown } | undefined>;
  };
  const colors: string[] = [];
  const background = source.background;
  if (background?.type === "color" && isHexColor(background.color)) {
    colors.push(formatHexColor(parseHexColor(background.color)));
  } else if (background?.type === "gradient") {
    for (const color of [background.from, background.to]) {
      if (isHexColor(color)) colors.push(formatHexColor(parseHexColor(color)));
    }
  }
  for (const appearance of Object.values(source.appearance ?? {})) {
    if (appearance && isHexColor(appearance.backgroundColor)) {
      colors.push(formatHexColor(parseHexColor(appearance.backgroundColor)));
    }
  }
  if (!colors.length) {
    colors.push(...fallbacks.filter(isHexColor).map((color) => formatHexColor(parseHexColor(color))));
  }
  return [...new Set(colors)];
}

export type ContrastReview = {
  assessments: ContrastAssessment[];
  issues: ContrastAssessment[];
};

/** Review one block's text against its resolved surfaces during a tree walk. */
export function reviewContrast(
  foreground: unknown,
  design: unknown,
  inheritedBackgrounds: readonly unknown[] = [],
  minimum = WCAG_AA_NORMAL_TEXT,
): ContrastReview {
  const assessments = resolveContrastBackgrounds(design, inheritedBackgrounds)
    .map((background) => assessContrast(foreground, background, minimum))
    .filter((assessment): assessment is ContrastAssessment => assessment !== null);
  return {
    assessments,
    issues: assessments.filter((assessment) => !assessment.passes),
  };
}

/** Human-readable warning text shared by inspector and generation QA. */
export function contrastWarning(
  foreground: unknown,
  background: unknown,
  minimum = WCAG_AA_NORMAL_TEXT,
): string | null {
  const result = assessContrast(foreground, background, minimum);
  if (!result || result.passes) return null;
  return `Text contrast is ${result.ratio.toFixed(2)}:1; at least ${minimum}:1 is recommended.`;
}
