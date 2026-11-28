// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GraderAdmin } from "./grader-admin";

const checks = [
  { id: "title", category: "seo", status: "pass", value: "A title", detail: "Title found", fix: "Keep it clear" },
  { id: "places_rating", category: "local", status: "warn", value: 3.5, detail: "Google rating", fix: "Review feedback" },
  { id: "privacy", category: "security", status: "fail", value: null, detail: "Missing policy", fix: "Add policy" },
  { id: "contrast", category: "accessibility", status: "unknown", value: null, detail: "Couldn't check contrast", fix: "Review contrast" },
];
const base = {
  slug: "site-123", url_input: "https://example.com/", final_url: "https://example.com/", domain: "example.com",
  business_name: "Example", city: "Austin", progress: { html: "complete", mobile: "running" },
  screenshot_url: null, results: null, scores: null, ai_summary: null,
};
const complete = {
  ...base, status: "complete", screenshot_url: "https://cdn.example.com/screenshot.png",
  results: { checks, places_enabled: true },
  scores: { overall: 75, grade: "C", categories: { seo: 100, local: 50, security: 0, accessibility: null } },
  ai_summary: { headline: "Headline", summary: "Summary", top_issues: [
    { check_id: "privacy", title: "Policy", why_it_matters: "Trust", fix: "Add policy" },
  ], fix_plan: ["Fix policy"], sitomax_pitch: "We can help." },
};

const listRow = {
  id: "50da05be-c0bc-4d58-a49f-44f59f44bf09", slug: "old-456", created_at: "2026-05-01T10:00:00Z", domain: "old.example",
  business_name: "Old Shop", url_input: "https://old.example/", final_url: "https://old.example/", city: "Austin",
  has_google_profile: "yes", google_maps_url: null, status: "complete", overall: 64, grade: "D", source: "public",
  unlocked: true, share_disabled: false, unlock_name: "Ann", unlock_email: "ann@example.com",
  lead_id: "60da05be-c0bc-4d58-a49f-44f59f44bf09", compare_of_slug: null,
};

/** Serves the reports list separately so the scan/report calls stay in order. */
function api(responses: unknown[]) {
  return vi.fn(async (url: string) => url.startsWith("/api/grader/admin/reports")
    ? { ok: true, json: async () => ({ rows: [listRow], total: 1, pageSize: 25 }) }
    : responses.shift());
}
const calls = (fetch: ReturnType<typeof api>) => fetch.mock.calls.filter(([url]) => !String(url).startsWith("/api/grader/admin/reports"));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("starts a scan, polls progress, and renders scores, all statuses, Places, AI and screenshot", async () => {
  const fetch = api([
    { ok: true, json: async () => ({ slug: "site-123" }) },
    { ok: true, json: async () => ({ ...base, status: "running" }) },
    { ok: true, json: async () => ({ ...complete, source: "admin", unlocked: false, share_disabled: false }) },
  ]);
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<GraderAdmin initialSlug={null} />));
  const input = container.querySelector<HTMLInputElement>('input[name="url"]')!;
  input.value = "example.com";
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(calls(fetch)[0][0]).toBe("/api/grader/admin/scan");
  expect(JSON.parse(String((calls(fetch)[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ url: "example.com" });
  expect(container.textContent).toContain("Scanning");
  expect(container.textContent).toContain("Mobile: Checking");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(container.textContent).toContain("75/100");
  expect(container.textContent).toContain("3.5");
  expect(container.textContent).toContain("Passed:");
  expect(container.textContent).toContain("Needs work");
  expect(container.textContent).toContain("Issue");
  expect(container.textContent).toContain("Copy share link");
  expect(container.querySelector('a[href="/api/grader/admin/pdf/site-123"]')).not.toBeNull();
  expect(container.querySelector('a[href="https://sitomax.com/grade/site-123"]')).not.toBeNull();
  expect(container.textContent).toContain("Couldn't check contrast");
  expect(container.textContent).toContain("Headline");
  expect(container.textContent).toContain("Fix policy");
  expect(container.querySelector("img")?.getAttribute("src")).toContain("screenshot.png");
});

it("allows retrying a failed report request without pretending it succeeded", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/grader/admin/reports")
    ? { ok: true, json: async () => ({ rows: [], total: 0, pageSize: 25 }) } : { ok: false, status: 503 }));
  await act(async () => root.render(<GraderAdmin initialSlug="site-123" />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load the report");
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(container.textContent).toContain("Retry report");
});

it("lists reports with lead links and re-runs a scan with the original input", async () => {
  const fetch = api([{ ok: true, json: async () => ({ slug: "old-789" }) }, { ok: true, json: async () => ({ ...base, slug: "old-789", status: "running" }) }]);
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<GraderAdmin initialSlug={null} />));
  expect(container.textContent).toContain("Old Shop");
  expect(container.textContent).toContain("ann@example.com");
  expect(container.querySelector('a[href="/dashboard/leads/60da05be-c0bc-4d58-a49f-44f59f44bf09"]')).not.toBeNull();
  const rerun = [...container.querySelectorAll("button")].find((button) => button.textContent === "Re-run scan")!;
  await act(async () => rerun.click());
  const [url, init] = calls(fetch)[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/grader/admin/scan");
  expect(JSON.parse(String(init.body))).toEqual({ url: "https://old.example/", businessName: "Old Shop", city: "Austin", hasGoogleProfile: "yes" });
});
