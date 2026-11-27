// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("./turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (token: string) => void }) =>
    <button type="button" onClick={() => onToken("verified-token")}>Verify</button>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { GraderScanForm } from "./scan-form";
import { GraderResults } from "./results";

const slug = "example-0123456789abcdef";
const teaser = {
  slug, url: "https://example.com/", domain: "example.com", status: "running",
  progress: { html: "complete", mobile: "running" }, scores: null, screenshot_url: null,
  unlocked: false, headline: null, top_issues: null,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public grader pages", () => {
  it("requires a verification token and submits optional inputs to the platform API", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "Try again later." }, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<GraderScanForm initialUrl="example.com" />));
    const form = container.querySelector("form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("complete verification");
    await act(async () => container.querySelector<HTMLButtonElement>("button[type=button]")!.click());
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ url: "example.com", turnstileToken: "verified-token" });
    expect(container.textContent).toContain("Try again later.");
  });

  it("navigates to the report after a successful scan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ slug })));
    await act(async () => root.render(<GraderScanForm initialUrl="example.com" />));
    await act(async () => container.querySelector<HTMLButtonElement>("button[type=button]")!.click());
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.push).toHaveBeenCalledWith(`/grader/${slug}`);
  });

  it("polls until complete and shows only teaser results", async () => {
    const complete = { ...teaser, status: "complete", scores: {
      overall: 80, grade: "B", categories: { speed: 80, mobile: null },
    }, headline: "A useful start.", top_issues: [{ title: "Improve speed", why_it_matters: "Pages take time to load." }] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(teaser)).mockResolvedValueOnce(Response.json(complete));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<GraderResults slug={slug} />));
    expect(container.textContent).toContain("Getting to know your website");
    expect(container.textContent).toContain("Testing mobile speed");
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Grade B");
    expect(container.textContent).toContain("Improve speed");
    expect(container.textContent).toContain("Couldn't check");
    expect(container.textContent).toContain("full report");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not display full fields from an invalid locked report", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...teaser, results: { checks: [], places_enabled: false } })));
    await act(async () => root.render(<GraderResults slug={slug} />));
    expect(container.textContent).toContain("couldn't load your report");
    expect(container.textContent).not.toContain("Your score breakdown");
  });
});
