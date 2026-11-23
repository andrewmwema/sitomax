// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }));
vi.mock("./inbox", () => ({ useLeadInbox: () => null }));
vi.mock("./lead-actions", () => ({ leadActionPatch: vi.fn(), runLeadAction: vi.fn(), setLeadStatus: vi.fn() }));
import { ConversationHeader } from "./conversation-header";

const lead: Lead = {
  id: "00000000-0000-4000-8000-000000000001", site_id: "00000000-0000-4000-8000-000000000002",
  form_name: "Contact", page_path: "/", data: { name: "Alex" }, created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z", is_read: true, has_unread_reply: false, status: "new", archived: false,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
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
});
