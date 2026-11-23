import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), conversation: vi.fn(), eq: vi.fn(), missing: false, allowed: false }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from, rpc: mocks.rpc }, user: { id: "member" } }) }));
vi.mock("@/lib/leads/conversation", () => ({ loadLeadConversation: mocks.conversation }));
vi.mock("@/components/dashboard/leads/conversation", () => ({
  ConversationSkeleton: () => <p>Loading</p>,
  LeadConversationView: ({ lead, canTrash }: { lead: Lead; canTrash: boolean }) =>
    <article data-lead={lead.id} data-can-manage={canTrash}>{lead.status} conversation</article>,
}));
import LeadConversationPage from "./page";

const lead: Lead = {
  id: "00000000-0000-4000-8000-000000000001", site_id: "00000000-0000-4000-8000-000000000002",
  form_name: "Contact", page_path: "/", data: { name: "Alex" }, created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z", is_read: true, has_unread_reply: false, status: "won", archived: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.missing = false;
  mocks.allowed = false;
  mocks.rpc.mockImplementation(async () => ({ data: mocks.allowed, error: null }));
  mocks.conversation.mockResolvedValue({ messages: [] });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: mocks.eq.mockImplementation(() => query), order: () => query,
      maybeSingle: async () => ({
        data: table === "form_submissions" ? mocks.missing ? null : lead : { name: "Example" }, error: null,
      }),
      returns: async () => ({ data: [], error: null }),
    };
    return query;
  });
});

async function render(leadId = lead.id) {
  const stream = await renderToReadableStream(<LeadConversationPage params={Promise.resolve({ leadId })} />);
  await stream.allReady;
  return new Response(stream).text();
}

describe("notification conversation deep links", () => {
  it("loads an archived, won lead directly by ID, independently of inbox view membership", async () => {
    const html = await render();
    expect(html).toContain(`data-lead="${lead.id}"`);
    expect(html.replaceAll("<!-- -->", "")).toContain("won conversation");
    expect(html).toContain('data-can-manage="false"');
    expect(mocks.eq).toHaveBeenCalledWith("id", lead.id);
    expect(mocks.conversation).toHaveBeenCalledWith(expect.anything(), lead, "member");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("can_manage_site_leads", { p_site: lead.site_id });
  });

  it("does not bypass RLS for a missing or unauthorized lead", async () => {
    mocks.missing = true;
    expect(await render()).toContain("That lead is unavailable or you do not have permission");
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
});
