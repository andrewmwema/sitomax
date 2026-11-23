// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

const mocks = vi.hoisted(() => ({ inboxAction: vi.fn(), update: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/forms/actions", () => ({ applyLeadInboxAction: mocks.inboxAction, updateLeads: mocks.update }));
vi.mock("@/app/(dashboard)/dashboard/leads/actions", () => ({ fetchLeadInbox: vi.fn() }));
vi.mock("@/components/dashboard/lead-inbox-shortcuts", () => ({ LeadInboxShortcuts: () => null }));
vi.mock("next/navigation", () => ({ useParams: () => ({}), usePathname: () => "/dashboard/leads", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: { children: ReactNode; href: string; prefetch?: boolean }) => {
  void prefetch;
  return <a {...props}>{children}</a>;
} }));
import { leadDisplayName } from "./format";
import { LeadInboxProvider, type LeadInbox } from "./inbox";
import { LeadList } from "./lead-list";
import { LeadToaster } from "./ui";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lead = (n: number, data: Record<string, string>, extra: Partial<Lead> = {}): Lead => ({
  id: id(n), site_id: id(900), form_name: "Contact", page_path: "/contact", data, created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z", is_read: true, has_unread_reply: false, status: "new", archived: false, ...extra,
});
const rows = [
  lead(1, { name: "Alex Johnson", email: "alex@example.test" }, { unread: true, last_message_direction: "out", last_message_preview: "See you Tuesday." }),
  lead(2, { email: "walkin@example.test", message: "Do you repair boilers?" }, { starred: true }),
  ...Array.from({ length: 30 }, (_, index) => lead(index + 3, { name: `Lead ${index + 3}` })),
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let setQuery: ReturnType<typeof vi.fn>;
let patch: ReturnType<typeof vi.fn>;
async function mount(overrides: Partial<LeadInbox> = {}) {
  const inbox: LeadInbox = {
    userId: "user", showSites: false, sites: [{ id: id(900), name: "Northside", subdomain: "northside" }],
    query: { view: "needs_reply", q: "", site: "" }, queryString: "?view=starred", setQuery,
    rows, error: null, hasMore: false, loadingMore: false, refreshing: false,
    counts: { needs_reply: 4, waiting: 2, all_open: 9, starred: 1, won: 3, lost: 0, archived: 5, trash: 0 },
    selectedLeadId: id(2), loadMore: vi.fn(), reload: vi.fn(), patch, ...overrides,
  };
  await act(async () => root.render(<LeadInboxProvider value={inbox}><LeadList /><LeadToaster /></LeadInboxProvider>));
}
const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  setQuery = vi.fn();
  patch = vi.fn(() => vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("lead list", () => {
  it("rolls back a failed list action before reloading", async () => {
    const rollback = vi.fn();
    patch.mockReturnValue(rollback);
    mocks.inboxAction.mockResolvedValue({ error: "Could not star this lead." });
    const reload = vi.fn();
    await mount({ reload });
    await act(async () => container.querySelector<HTMLButtonElement>('.leads-row [aria-label="Star"]')!.click());
    expect(rollback).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(container.querySelector('.leads-toast[data-tone="error"]')?.textContent).toContain("Could not star this lead.");
  });

  const mobile = () => vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 767px)", addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  const pointer = async (target: Element, type: string, x: number, y = 50) => {
    await act(async () => target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
      { pointerType: "touch", pointerId: 1 })));
  };

  it("offers every mobile view and an explicit selection mode", async () => {
    mobile();
    await mount();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(8);
    expect(container.querySelector('[aria-label="More views"]')).toBeNull();
    await act(async () => byLabel("Select leads").click());
    const link = container.querySelector<HTMLAnchorElement>("a[data-lead-link]")!;
    await act(async () => link.click());
    expect(container.querySelector('[role="toolbar"]')?.textContent).toContain("1 selected");
    expect(container.querySelector<HTMLInputElement>(`[aria-label="Select Alex Johnson"]`)?.checked).toBe(true);
  });

  it("archives by swiping left and undoes through the existing server action", async () => {
    mobile();
    mocks.inboxAction.mockResolvedValue({ error: "" });
    await mount();
    const row = container.querySelector(".leads-row")!;
    await pointer(row, "pointerdown", 240);
    await pointer(row, "pointermove", 130);
    await pointer(row, "pointerup", 130);
    expect((mocks.inboxAction.mock.calls[0][1] as FormData).get("action")).toBe("archive");
    expect(patch).toHaveBeenCalledWith([rows[0].id], { archived: true });
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>(".leads-toast button")].find((item) => item.textContent === "Undo")!.click());
    expect((mocks.inboxAction.mock.calls[1][1] as FormData).get("action")).toBe("unarchive");
    const star = row.querySelector<HTMLButtonElement>('button[aria-label="Star"]')!;
    await pointer(star, "pointerdown", 340);
    await act(async () => star.click());
    expect((mocks.inboxAction.mock.calls[2][1] as FormData).get("action")).toBe("star");
  });

  it("marks unread leads read by swiping right but ignores vertical scrolling", async () => {
    mobile();
    mocks.inboxAction.mockResolvedValue({ error: "" });
    await mount();
    const row = container.querySelector(".leads-row")!;
    await pointer(row, "pointerdown", 120);
    await pointer(row, "pointermove", 135, 150);
    await pointer(row, "pointerup", 135, 150);
    expect(mocks.inboxAction).not.toHaveBeenCalled();
    await pointer(row, "pointerdown", 120);
    await pointer(row, "pointermove", 220);
    await pointer(row, "pointerup", 220);
    expect((mocks.inboxAction.mock.calls[0][1] as FormData).get("action")).toBe("read");
  });

  it("does not commit a swipe when the finger returns below the threshold", async () => {
    mobile();
    await mount();
    const row = container.querySelector(".leads-row")!;
    await pointer(row, "pointerdown", 240);
    await pointer(row, "pointermove", 130);
    await pointer(row, "pointermove", 236);
    await pointer(row, "pointerup", 236);
    expect(mocks.inboxAction).not.toHaveBeenCalled();
  });

  it("refreshes only after a sufficient downward pull at the top of the mobile list", async () => {
    mobile();
    const reload = vi.fn();
    await mount({ reload });
    const panel = container.querySelector(".leads-list-scroll")!;
    const touch = async (type: string, y: number) => {
      await act(async () => panel.dispatchEvent(Object.assign(new Event(type, { bubbles: true }),
        { touches: type === "touchend" ? [] : [{ clientX: 100, clientY: y }] })));
    };
    await touch("touchstart", 10);
    await touch("touchmove", 60);
    await touch("touchend", 60);
    expect(reload).not.toHaveBeenCalled();
    await touch("touchstart", 10);
    await touch("touchmove", 160);
    expect(container.textContent).toContain("Release to refresh");
    await touch("touchend", 160);
    expect(reload).toHaveBeenCalledOnce();
    Object.defineProperty(panel, "scrollTop", { value: 100, configurable: true });
    await touch("touchstart", 10);
    await touch("touchmove", 160);
    await touch("touchend", 160);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("titles rows with the lead's name or email, never the form, and previews the latest message", async () => {
    await mount();
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a[data-lead-link]")];
    expect(links[0].textContent).toContain("Alex Johnson");
    expect(links[0].textContent).toContain("You: See you Tuesday.");
    expect(links[0].textContent).toContain("Unread.");
    expect(links[1].textContent).toContain("walkin@example.test");
    expect(links[1].textContent).toContain("Do you repair boilers?");
    expect(container.textContent).not.toContain("Form submission");
    expect(links[1].getAttribute("href")).toBe(`/dashboard/leads/${id(2)}?view=starred`);
    expect(links[1].getAttribute("aria-current")).toBe("true");
  });

  it("offers three view tabs with counts and the rest under More", async () => {
    await mount();
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(["Needs reply4", "Waiting2", "All9"]);
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "More")!.click());
    const items = [...container.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent);
    expect(items).toEqual(["Starred1", "Won3", "Lost0", "Archived5", "Trash0"]);
    await act(async () => container.querySelectorAll<HTMLElement>('[role="menuitemradio"]')[3].click());
    expect(setQuery).toHaveBeenCalledWith({ view: "archived" });
  });

  it("applies a bulk action to every selected lead in batches", async () => {
    mocks.inboxAction.mockResolvedValue({ error: "", success: "ok" });
    await mount();
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    for (const row of rows) await act(async () => byLabel(`Select ${leadDisplayName(row.data)}`).click());
    expect(container.querySelector('[role="toolbar"]')?.textContent).toContain("32 selected");
    await act(async () => byLabel("Archive").click());
    const sent = mocks.inboxAction.mock.calls.map(([, form]) => ({ action: (form as FormData).get("action"), ids: (form as FormData).getAll("leadIds").length }));
    expect(sent).toEqual([{ action: "archive", ids: 25 }, { action: "archive", ids: 7 }]);
    expect(patch).toHaveBeenCalledWith(rows.map((row) => row.id), { archived: true });
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("shows a friendly empty state with a way out", async () => {
    await mount({ rows: [] });
    expect(container.textContent).toContain("You're all caught up ✓");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "View all leads")!.click());
    expect(setQuery).toHaveBeenCalledWith({ view: "all_open" });
    await mount({ rows: null });
    expect(container.querySelector('[aria-label="Loading leads"]')).not.toBeNull();
  });
});
