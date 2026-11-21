import { isAnalyticsSaltValid } from "@/lib/analytics-config";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !isAnalyticsSaltValid(process.env.ANALYTICS_HASH_SALT)) {
    console.error("Analytics is unavailable: ANALYTICS_HASH_SALT must be at least 32 characters.");
  }
}
