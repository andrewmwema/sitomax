export const CATEGORIES = [
  "speed", "mobile", "seo", "security", "conversion", "local", "social", "accessibility",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type Check = {
  id: string;
  category: Category;
  status: CheckStatus;
  value: string | number | null;
  detail: string;
  fix: string;
};

export type GraderInput = {
  url: string;
  businessName?: string;
  city?: string;
  hasGoogleProfile?: "yes" | "no" | "not_sure";
  googleMapsUrl?: string;
};
