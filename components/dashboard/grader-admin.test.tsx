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

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
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
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ slug: "site-123" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...base, status: "running" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => complete });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<GraderAdmin initialSlug={null} />));
  const input = container.querySelector<HTMLInputElement>('input[name="url"]')!;
  input.value = "example.com";
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(fetch.mock.calls[0][0]).toBe("/api/grader/admin/scan");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ url: "example.com" });
  expect(container.textContent).toContain("Scanning");
  expect(container.textContent).toContain("Mobile: Checking");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(container.textContent).toContain("75/100");
  expect(container.textContent).toContain("Places rating");
  expect(container.textContent).toContain("3.5");
  expect(container.textContent).toContain("Pass");
  expect(container.textContent).toContain("Warn");
  expect(container.textContent).toContain("Fail");
  expect(container.textContent).toContain("Couldn't check contrast");
  expect(container.textContent).toContain("Headline");
  expect(container.textContent).toContain("Fix policy");
  expect(container.querySelector("img")?.getAttribute("src")).toContain("screenshot.png");
});

it("allows retrying a failed report request without pretending it succeeded", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await act(async () => root.render(<GraderAdmin initialSlug="site-123" />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load the report");
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(container.textContent).toContain("Retry report");
});
