/**
 * The spacing scale every layout and design spacing value snaps to
 * (clients pick steps, never arbitrary pixel values).
 */
export const SPACING_SCALE = [0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128] as const;
export type SpacingStep = (typeof SPACING_SCALE)[number];

/** Nearest value on the spacing scale (ties go to the smaller step). */
export function snapSpacing(value: unknown, fallback: SpacingStep = 0): SpacingStep {
  if (typeof value === "string" && value.trim() === "") return fallback;
  const amount = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || !Number.isFinite(amount)) return fallback;
  let best: SpacingStep = SPACING_SCALE[0];
  for (const step of SPACING_SCALE) {
    if (Math.abs(step - amount) < Math.abs(best - amount)) best = step;
  }
  return best;
}

export const SPACING_OPTIONS = SPACING_SCALE.map((step) => ({
  label: `${step}px`,
  value: step,
}));
