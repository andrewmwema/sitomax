import type { Category } from "./types";

export const GRADER_WEIGHTS: Partial<Record<Category, number>> = {
  speed: 20,
  mobile: 15,
  seo: 20,
  security: 10,
  conversion: 20,
  local: 10,
  social: 5,
};
