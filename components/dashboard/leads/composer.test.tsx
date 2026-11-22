// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadComposerConfig } from "@/lib/leads/conversation";

const mocks = vi.hoisted(() => ({ send: vi.fn(), draft: vi.fn(), template: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/forms/reply-actions", () => ({
  sendLeadReply: mocks.send, draftLeadReply: mocks.draft, saveLeadReplyTemplate: mocks.template,
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/components/editor/link-picker", () => ({ EmailLinkPicker: () => null }));
import { LeadComposer, leadDraftKey } from "./composer";

const config: LeadComposerConfig = {
  leadId: "lead-1", siteId: "site-1", userId: "user-1", admin: false, to: { name: "Alex Johnson", email: "alex@example.test" },
  firstName: "Alex", business: "Northside", siteUrl: "https://northside.example.test", subject: "Re: Water heater",
  signature: "Sam Lee\nNorthside", quote: { header: "On Nov 21, 2026, Alex Johnson wrote:", text: "Can you help?" },
  bcc: { email: "sam@example.test", mine: true },
  details: { from: '"Northside" <leads@mail.example.test>', replyTo: "Tracked in this conversation", note: "Replies are tracked here.", problem: null },
  templates: [], pages: [], palette: ["#151829"],
};
const key = leadDraftKey(config.userId, config.leadId);
const draft = { subject: "Re: Water heater", html: "<p>Tuesday works for us.</p>", signature: "Sam Lee\nNorthside", bcc: false, quote: true };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const settle = (ms = 30) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const button = (name: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
async function mount(value: LeadComposerConfig = config) {
  await act(async () => root.render(<LeadComposer config={value} />));
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  window.localStorage.clear();
  // jsdom has no dialog methods; the composer only needs them to exist.
  for (const method of ["show", "showModal", "close"] as const) HTMLDialogElement.prototype[method] ??= () => {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("lead reply composer", () => {
  it("opens from one line and shows the recipient without technical addresses", async () => {
    await mount();
    expect(container.querySelector("dialog")).toBeNull();
    await act(async () => button("Reply to Alex…").click());
    await settle();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.textContent).toContain("Alex Johnson <alex@example.test>");
    expect(dialog.querySelector<HTMLInputElement>("input")!.value).toBe("Re: Water heater");
    expect(dialog.querySelector<HTMLTextAreaElement>('[aria-label="Signature"]')!.value).toBe("Sam Lee\nNorthside");
    expect(dialog.querySelector('[role="switch"]')?.textContent).toBe("Bcc me");
    expect(dialog.querySelector('[aria-label="Reply body"]')).not.toBeNull();
    // From and Reply-to stay behind "Email details" unless the viewer is the agency.
    expect(dialog.textContent).not.toContain("leads@mail.example.test");
    expect(button("Send").disabled).toBe(true);
  });

  it("shows email details to the agency by default", async () => {
    await mount({ ...config, admin: true });
    await act(async () => button("Reply to Alex…").click());
    await settle();
    expect(container.textContent).toContain("leads@mail.example.test");
    expect(container.textContent).toContain("Tracked in this conversation");
  });

  it("restores the saved draft for the lead and keeps saving changes", async () => {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, subject: "Re: Tuesday" }));
    await mount();
    const subject = container.querySelector<HTMLInputElement>("dialog input")!;
    expect(subject.value).toBe("Re: Tuesday");
    expect(container.querySelector('[aria-label="Reply body"]')?.textContent).toBe("Tuesday works for us.");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(subject, "Re: Thursday");
      subject.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(750);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toMatchObject({ subject: "Re: Thursday", html: "<p>Tuesday works for us.</p>" });
    expect(container.textContent).toContain("Draft saved");
  });

  it("sends with the signature and quoted message, then clears the draft", async () => {
    window.localStorage.setItem(key, JSON.stringify(draft));
    mocks.send.mockResolvedValue({ success: "Reply sent." });
    await mount();
    await act(async () => button("More send options").click());
    await act(async () => button("Send & mark Won").click());
    await settle();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "lead-1", subject: "Re: Water heater", html: "<p>Tuesday works for us.</p>", signature: "Sam Lee\nNorthside",
      quote: true, bcc: false, after: "won",
    }));
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
    expect(button("Reply to Alex…")).toBeDefined();
  });

  it("keeps the reply open with the reason and retries the same send", async () => {
    window.localStorage.setItem(key, JSON.stringify(draft));
    mocks.send.mockResolvedValueOnce({ error: "Could not reserve this reply.", detail: "reserve_lead_reply failed (42501)." })
      .mockResolvedValueOnce({ error: "The email service did not confirm delivery.", reserved: true });
    await mount();
    await act(async () => button("Send").click());
    await settle();
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Could not reserve this reply.");
    expect(alert.textContent).toContain("reserve_lead_reply failed (42501).");
    expect(container.querySelector('[aria-label="Reply body"]')?.textContent).toBe("Tuesday works for us.");

    await act(async () => button("Retry").click());
    await settle();
    await act(async () => button("Retry").click());
    await settle();
    const ids = mocks.send.mock.calls.map(([input]) => (input as { requestId: string }).requestId);
    // Nothing was recorded by the first attempt, so the retry reuses it; a recorded attempt starts a new send.
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  it("blocks sending while a [placeholder] remains", async () => {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, html: "<p>See you on [day].</p>" }));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("[day]");
    expect(container.querySelector(".leads-placeholder")).not.toBeNull();
    expect(button("Send").disabled).toBe(true);
  });
});
