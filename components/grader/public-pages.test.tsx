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

import { GraderEmbeddedForm, GraderScanForm } from "./scan-form";
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

  it("unlocks with explicit consent and refreshes the report without navigation", async () => {
    const complete = { ...teaser, status: "complete", scores: {
      overall: 80, grade: "B", categories: { speed: 80 },
    }, headline: "A useful start.", top_issues: [] };
    const full = { ...complete, unlocked: true, results: { checks: [{
      id: "seo_title", category: "seo", status: "warn", value: null, detail: "Title needs attention.", fix: "Improve the title.",
    }], places_enabled: false }, ai_summary: null };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(complete))
      .mockResolvedValueOnce(Response.json({ ok: true })).mockResolvedValueOnce(Response.json(full));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<GraderResults slug={slug} />));
    const form = container.querySelector("form")!;
    form.querySelector<HTMLInputElement>("[name=name]")!.value = "Example";
    form.querySelector<HTMLInputElement>("[name=email]")!.value = "owner@example.com";
    expect(form.querySelector<HTMLInputElement>("[name=consentMarketing]")!.checked).toBe(false);
    await act(async () => form.querySelector<HTMLButtonElement>("button[type=button]")!.click());
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      slug, name: "Example", email: "owner@example.com", consentMarketing: false, turnstileToken: "verified-token",
    });
    expect(container.textContent).toContain("Title needs attention.");
    expect(container.querySelector("form")).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("downloads from the report host and shows a retry message on failure", async () => {
    const full = { ...teaser, status: "complete", unlocked: true, results: { checks: [], places_enabled: false }, ai_summary: null };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(full))
      .mockResolvedValueOnce(Response.json({ error: "internal" }, { status: 503 }))
      .mockResolvedValueOnce(new Response("pdf data", { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetch);
    const create = vi.fn().mockReturnValue("blob:test");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await act(async () => root.render(<GraderResults slug={slug} />));
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Download PDF")!;
      await act(async () => button.click());
      expect(fetch.mock.calls[1][0]).toBe(`/grader/${slug}/pdf`);
      expect(container.querySelector("[role=alert]")?.textContent).toContain("Please try again");
      await act(async () => button.click());
      expect(container.querySelector("[role=alert]")).toBeNull();
      expect(create).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(revoke).toHaveBeenCalledWith("blob:test");
    } finally { click.mockRestore(); }
  });

  it("renders a non-interactive embedded form in the editor preview", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<GraderEmbeddedForm preview />));
    expect(container.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
    expect(container.textContent).not.toContain("Verify");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("starts an embedded scan and navigates to the marketing report", async () => {
    const assign = vi.fn();
    const fakeWindow = Object.create(window);
    Object.defineProperty(fakeWindow, "location", { value: { assign } });
    vi.stubGlobal("window", fakeWindow);
    const fetch = vi.fn().mockResolvedValue(Response.json({ slug }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<GraderEmbeddedForm />));
    const form = container.querySelector("form")!;
    form.querySelector<HTMLInputElement>("[name=url]")!.value = "example.com";
    await act(async () => form.querySelector<HTMLButtonElement>("button[type=button]")!.click());
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ url: "example.com", turnstileToken: "verified-token" });
    expect(assign).toHaveBeenCalledWith(`https://sitomax.com/grader/${slug}`);
  });
});
