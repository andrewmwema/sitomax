/**
 * Test stub for next/font/google: the real module only works through the
 * Next compiler. Returns the same shape ({ variable, className }) so
 * lib/theme/fonts.ts can be imported from vitest.
 */

type FontStub = { variable: string; className: string; style: object };

function fontStub(): FontStub {
  return { variable: "", className: "", style: {} };
}

export const Inter = fontStub;
export const DM_Serif_Display = fontStub;
export const Plus_Jakarta_Sans = fontStub;
