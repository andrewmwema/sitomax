// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";
import type { LeadConversation, LeadThreadMessage } from "@/lib/leads/conversation";

vi.mock("@/components/dashboard/mark-lead-viewed", () => ({ MarkLeadViewed: () => null }));
import { LeadThread } from "./thread";

const lead: Lead = {
  id: "lead-1", site_id: "site-1", form_name: "Contact", page_path: "/", data: { name: "Alex" },
  created_at: "2026-11-01T10:00:00Z", last_activity_at: "2026-11-01T10:00:00Z",
  is_read: true, has_unread_reply: false, status: "new", archived: false,
};
const message = (id: string): LeadThreadMessage => ({
  id, direction: "in", sender: "Alex", subject: "Reply", showSubject: false, html: "<p>Message</p>",
  quoteHtml: "", quoteText: "", delivery: null, forwardIssue: null, autoReply: false, hasAttachments: false,
  createdAt: "2026-11-02T10:00:00Z",
});
const conversation: LeadConversation = {
  messages: [message("1")], via: "Agency", truncated: false, selectedId: null, selectedMissing: false, notice: null, blocked: null, composer: null,
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mount = (messages: LeadThreadMessage[]) => act(async () => root.render(
  <div data-thread-pane><LeadThread lead={lead} siteName="Website" conversation={{ ...conversation, messages }} /></div>,
));
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

it("preserves reading position on refresh, but follows new messages when already at the bottom", async () => {
  await mount(conversation.messages);
  const pane = container.querySelector<HTMLElement>("[data-thread-pane]")!;
  Object.defineProperties(pane, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200 } });
  pane.scrollTop = 100;
  pane.dispatchEvent(new Event("scroll"));
  await mount([message("1"), message("2")]);
  expect(pane.scrollTop).toBe(100);
  pane.scrollTop = 800;
  pane.dispatchEvent(new Event("scroll"));
  Object.defineProperty(pane, "scrollHeight", { value: 1200, configurable: true });
  await mount([message("1"), message("2"), message("3")]);
  expect(pane.scrollTop).toBe(1200);
  Object.defineProperty(pane, "scrollHeight", { value: 1400, configurable: true });
  await mount([message("2"), message("3"), message("4")]);
  expect(pane.scrollTop).toBe(1400);
});
