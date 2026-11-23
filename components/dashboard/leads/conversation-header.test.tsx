// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

const mocks = vi.hoisted(() => ({ action: vi.fn(), patch: vi.fn(), reload: vi.fn(), rollback: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
vi.mock("./inbox", () => ({ useLeadInbox: () => ({ patch: mocks.patch, reload: mocks.reload, queryString: "" }) }));
vi.mock("./lead-actions", async (original) => ({ ...await original<object>(), runLeadAction: mocks.action }));
import { ConversationHeader } from "./conversation-header";
import { LEAD_TRASH_EVENT } from "@/components/dashboard/lead-inbox-shortcuts";

const lead: Lead = {
  id: "00000000-0000-4000-8000-000000000001", site_id: "00000000-0000-4000-8000-000000000002",
  form_name: "Contact", page_path: "/", data: { name: "Alex" }, created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z", is_read: true, has_unread_reply: false, status: "new", archived: false,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.patch.mockReturnValue(mocks.rollback);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("conversation export action", () => {
  it.each([true, false])("shows Export only with export permission (%s)", async (canExport) => {
    await act(async () => root.render(<ConversationHeader lead={lead} siteName="Website" canTrash={canExport} canExport={canExport}
      detailsOpen={false} detailsId="details" onToggleDetails={vi.fn()} showNotes={false} onToggleNotes={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!.click());
    expect(container.textContent).toContain("Show notes in thread");
    const link = container.querySelector<HTMLAnchorElement>('a[role="menuitem"][download]');
    if (canExport) {
      expect(link?.textContent).toBe("Export");
      expect(link?.getAttribute("href")).toBe(`/dashboard/forms/export?id=${lead.id}`);
    } else {
      expect(link).toBeNull();
    }
  });

  it("rolls a failed optimistic action back in both the header and list before reloading", async () => {
    let finish!: (error: string) => void;
    mocks.action.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await act(async () => root.render(<ConversationHeader lead={lead} siteName="Website" canTrash canExport
      detailsOpen={false} detailsId="details" onToggleDetails={vi.fn()} showNotes={false} onToggleNotes={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Star"]')!.click());
    expect(container.querySelector('[aria-label="Remove star"]')).not.toBeNull();
    await act(async () => finish("Could not save this change."));
    expect(container.querySelector('[aria-label="Star"]')).not.toBeNull();
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.reload).toHaveBeenCalledOnce();
  });

  it.each([true, false])("honors trash permission for the keyboard command (%s)", async (canTrash) => {
    mocks.action.mockResolvedValue(null);
    await act(async () => root.render(<ConversationHeader lead={lead} siteName="Website" canTrash={canTrash} canExport={canTrash}
      detailsOpen={false} detailsId="details" onToggleDetails={vi.fn()} showNotes={false} onToggleNotes={vi.fn()} />));
    await act(async () => window.dispatchEvent(new Event(LEAD_TRASH_EVENT)));
    expect(mocks.action).toHaveBeenCalledTimes(canTrash ? 1 : 0);
    if (canTrash) expect(mocks.action).toHaveBeenCalledWith("trash", [lead.id], undefined);
  });
});
