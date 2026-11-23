// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";
import type { LeadConversation } from "@/lib/leads/conversation";

const mocks = vi.hoisted(() => ({ mobile: true, tablet: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
vi.mock("./inbox", () => ({ useLeadInbox: () => null }));
vi.mock("./lead-actions", () => ({ leadActionPatch: vi.fn(), runLeadAction: vi.fn(), setLeadStatus: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/forms/actions", () => ({ saveLeadNote: vi.fn() }));
vi.mock("./composer", () => ({ LeadComposer: () => <button>Reply…</button> }));
vi.mock("./thread", () => ({ LeadThread: () => <p>Conversation messages</p> }));
import { LeadConversationView } from "./conversation";

const lead: Lead = {
  id: "00000000-0000-4000-8000-000000000001", site_id: "00000000-0000-4000-8000-000000000002",
  form_name: "Contact", page_path: "/", data: { name: "Alex", phone: "+15551234567" }, created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z", is_read: true, has_unread_reply: false, status: "new", archived: false,
};
const conversation: LeadConversation = {
  messages: [], via: "Agency", truncated: false, selectedId: null, selectedMissing: false, notice: null, blocked: null, composer: null,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const tab = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === label)!;
async function mount(withNote = false) {
  await act(async () => root.render(<LeadConversationView lead={lead} siteName="Website" canTrash={false} userId="user-1"
    conversation={conversation} notes={withNote ? [{ id: "note-1", body: "Call tomorrow.", mine: true, created_at: lead.created_at }] : []}
    events={withNote ? [{ id: "event-1", type: "note_added", data: {}, created_at: lead.created_at }] : []} />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 767px)" ? mocks.mobile : mocks.tablet,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  mocks.mobile = true;
  mocks.tablet = false;
  window.localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("responsive lead conversation", () => {
  it("switches between conversation, contact details, and notes without unmounting the thread", async () => {
    await mount();
    const thread = container.querySelector("[data-thread-pane]");
    await act(async () => tab("Details").click());
    expect(container.querySelector(".leads-thread-section")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector('[aria-label="Lead details"] a[href="tel:+15551234567"]')).not.toBeNull();
    await act(async () => tab("Notes").click());
    expect(container.textContent).toContain("Add an internal note");
    await act(async () => tab("Conversation").click());
    expect(container.querySelector(".leads-thread-section")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("[data-thread-pane]")).toBe(thread);
  });

  it("puts mobile actions in More and keeps export hidden for editors", async () => {
    await mount();
    await act(async () => button("More actions").click());
    const menu = container.querySelector('[role="menu"][aria-label="More actions"]')!;
    for (const label of ["Star", "Archive", "Snooze", "Reminder", "Mark unread", "Details"]) expect(menu.textContent).toContain(label);
    expect(menu.textContent).not.toContain("Export");
    expect(menu.textContent).not.toContain("Move to trash");
  });

  it("opens the mobile Notes section from a note timeline entry", async () => {
    await mount(true);
    await act(async () => tab("Details").click());
    await act(async () => tab("Timeline").click());
    const note = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.startsWith("Note added"))!;
    await act(async () => note.click());
    expect(tab("Notes1").getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Call tomorrow.");
  });

  it("opens tablet details as a modal overlay and closes it on Escape", async () => {
    mocks.mobile = false;
    mocks.tablet = true;
    await mount();
    await act(async () => button("Show details").click());
    const dialog = container.querySelector<HTMLDialogElement>("dialog.leads-details-overlay")!;
    expect(dialog.open).toBe(true);
    await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(container.querySelector("dialog.leads-details-overlay")).toBeNull();
    expect(document.activeElement).toBe(button("Show details"));
  });

  it("keeps arrow keys inside a nested scheduling popover and returns focus on Escape", async () => {
    await mount();
    await act(async () => button("More actions").click());
    const snooze = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent === "Snooze")!;
    await act(async () => snooze.click());
    const input = container.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    input.focus();
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(input);
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(snooze);
    expect(container.querySelector('[role="menu"][aria-label="More actions"]')).not.toBeNull();
  });

  it("closes desktop Details with Escape and returns focus to its toggle", async () => {
    mocks.mobile = false;
    await mount();
    const toggle = button("Show details");
    await act(async () => toggle.click());
    const contact = tab("Contact");
    contact.focus();
    await act(async () => contact.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(container.querySelector(".leads-details")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});
