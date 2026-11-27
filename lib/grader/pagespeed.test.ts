import { afterEach, expect, it, vi } from "vitest";
import { pageSpeedChecks, runPageSpeed } from "./pagespeed";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("marks unavailable audits unknown without inventing results", () => {
  const checks = pageSpeedChecks(null, "mobile");
  expect(checks.length).toBeGreaterThan(5);
  expect(checks.every((check) => check.status === "unknown" && check.value === null)).toBe(true);
});

it("uses available PSI audits even when an unrelated audit has unexpected fields", async () => {
  vi.stubEnv("PAGESPEED_API_KEY", "");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    lighthouseResult: {
      categories: { performance: { score: 0.9 } },
      audits: {
        "largest-contentful-paint": { score: 0.9, displayValue: "1.5 s" },
        "unrelated-audit": { score: null, details: null, numericValue: null },
      },
    },
  })));
  vi.stubGlobal("fetch", fetch);
  const result = await runPageSpeed("https://example.com/", "mobile");
  expect(result.checks.find((check) => check.id === "mobile_lcp")).toMatchObject({ status: "pass", value: "1.5 s" });
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.has("key")).toBe(false);
});

it("uses the provider's actual scores and values", () => {
  const checks = pageSpeedChecks({
    categories: { performance: { score: 0.45 }, seo: { score: 1 } },
    audits: { "largest-contentful-paint": { score: 0.8, displayValue: "3.2 s", numericValue: 3200 } },
  }, "mobile");
  expect(checks.find((check) => check.id === "mobile_performance")).toMatchObject({ status: "fail", value: 45 });
  expect(checks.find((check) => check.id === "mobile_lcp")).toMatchObject({ status: "warn", value: "3.2 s" });
  expect(checks.find((check) => check.id === "psi_seo")).toMatchObject({ status: "pass", value: 100 });
});
