// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormSubmission } from "./form-submission";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("form submission feedback", () => {
  it("shows success and resets fields after a successful request, and surfaces errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<FormSubmission className=""><input name="Name" defaultValue="Alex" /></FormSubmission>));
    const form = container.querySelector("form")!;
    const input = container.querySelector("input")!;
    input.value = "Sam";
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("message has been sent");
    expect(input.value).toBe("Alex");
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Too many submissions");
    await act(async () => root.unmount()); container.remove();
  });
});
