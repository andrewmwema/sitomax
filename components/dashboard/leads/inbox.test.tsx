// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), router: { refresh: vi.fn() }, params: { leadId: "deep-linked-lead" }, query: new URLSearchParams("view=waiting"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router, useParams: () => mocks.params,
  usePathname: () => "/dashboard/leads/deep-linked-lead", useSearchParams: () => mocks.query,
}));
vi.mock("@/app/(dashboard)/dashboard/leads/actions", () => ({ fetchLeadInbox: mocks.fetch }));
vi.mock("@/components/dashboard/lead-inbox-shortcuts", () => ({ LeadInboxShortcuts: () => null }));
vi.mock("./lead-list", () => ({ LeadList: () => null }));
import { LeadsInbox, useLeadInbox, type LeadInbox } from "./inbox";

const probe = vi.fn<(value: LeadInbox) => void>();
function Conversation() {
  probe(useLeadInbox()!);
  return <textarea aria-label="Unsent reply" defaultValue="Keep my draft" />;
}
const lead = (n: number): Lead => ({
  id: `lead-${n}`, site_id: "site", form_name: "Contact", page_path: "/", data: { name: "Alex" },
  created_at: "2026-11-01T10:00:00Z", last_activity_at: "2026-11-01T10:00:00Z",
  is_read: true, has_unread_reply: false, status: "new", archived: false, starred: false,
});
const page = (rows = [lead(1)], hasMore = false) => ({ rows, hasMore, counts: null });
const inbox = () => probe.mock.calls.at(-1)![0];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mount = async (refreshKey = "1") => {
  await act(async () => root.render(<LeadsInbox userId="user" sites={[]} agency={false} refreshKey={refreshKey}><Conversation /></LeadsInbox>));
};
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(45_000); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mocks.fetch.mockReset().mockResolvedValue(page());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("inbox refresh and optimistic changes", () => {
  it("polls the whole route at 45 seconds, preserving the selected lead and unsent client state", async () => {
    await mount();
    const draft = container.querySelector("textarea")!;
    draft.value = "Still editing";
    expect(inbox().rows?.map((row) => row.id)).not.toContain(mocks.params.leadId);
    expect(container.querySelector(".leads-inbox")?.getAttribute("data-open")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(44_999); });
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    mocks.fetch.mockResolvedValue(page([{ ...lead(1), last_message_preview: "New reply" }]));
    await mount("2");
    expect(inbox().rows?.[0].last_message_preview).toBe("New reply");
    expect(container.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Still editing");
    expect(inbox().selectedLeadId).toBe(mocks.params.leadId);
  });

  it("pauses while hidden, offline or mutating, refreshes on return, and cleans up on unmount", async () => {
    await mount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await tick();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    mocks.router.refresh.mockClear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await tick();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    container.querySelector("textarea")!.setAttribute("data-lead-mutating", "true");
    await tick();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    container.querySelector("textarea")!.removeAttribute("data-lead-mutating");
    await tick();
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    await tick();
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it("does not poll during an in-flight list request", async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    mocks.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    await mount();
    await tick();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    await act(async () => resolve(page()));
    await tick();
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it("rolls back only affected fields immediately, even when the subsequent reload fails", async () => {
    await mount();
    let rollback!: () => void;
    await act(async () => { rollback = inbox().patch(["lead-1"], { starred: true, archived: true, unread: true, status: "won" }); });
    expect(inbox().rows?.[0]).toMatchObject({ starred: true, archived: true, unread: true, status: "won" });
    await act(async () => { inbox().patch(["lead-1"], { last_message_preview: "Arrived while saving" }); });
    await act(async () => rollback());
    expect(inbox().rows?.[0]).toMatchObject({ starred: false, archived: false, status: "new", last_message_preview: "Arrived while saving" });
    expect(inbox().rows?.[0].unread).toBeUndefined();
    mocks.fetch.mockResolvedValue({ error: "Offline" });
    await act(async () => inbox().reload());
    expect(inbox().rows?.[0]).toMatchObject({ starred: false, archived: false, status: "new" });
  });

  it("does not truncate a paginated list to 400 rows during a refresh", async () => {
    mocks.fetch.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, n) => lead(n)), true));
    await mount();
    for (let offset = 50; offset < 450; offset += 50) {
      mocks.fetch.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, n) => lead(n + offset)), true));
      await act(async () => inbox().loadMore());
    }
    expect(inbox().rows).toHaveLength(450);
    for (let offset = 0; offset < 450; offset += 100) {
      mocks.fetch.mockResolvedValueOnce(page(Array.from({ length: Math.min(100, 450 - offset) }, (_, n) => lead(n + offset)), true));
    }
    await mount("refresh");
    expect(inbox().rows).toHaveLength(450);
    expect(inbox().rows?.at(-1)?.id).toBe("lead-449");
  });
});
