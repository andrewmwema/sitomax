import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), allowed: vi.fn(), page: vi.fn(), detail: true, events: [] as unknown[] }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from, rpc: mocks.rpc }, user: { id: "owner" } }) }));
vi.mock("@/lib/forms/queries", () => ({ allowedLeadSites: mocks.allowed, getSubmissionPage: mocks.page, LEAD_COLUMNS: "*", SUBMISSION_PAGE_SIZE: 25 }));
vi.mock("./reply-thread", () => ({ LeadReplyThread: () => <div>Reply conversation</div> }));
vi.mock("@/components/dashboard/mark-lead-viewed", () => ({ MarkLeadViewed: () => <div>Auto mark read</div> }));
vi.mock("@/components/dashboard/lead-controls", () => ({
  CopyLeadValue: () => null, LeadBulkForm: () => null, LeadNoteForm: () => <div>Note form</div>, LeadStatusForm: () => <div>Status form</div>,
}));
import FormsPage from "./page";

const id = "00000000-0000-4000-8000-000000000001";
const site = "00000000-0000-4000-8000-000000000002";
const lead = { id, site_id: site, form_name: "Contact", page_path: "/contact", data: { name: "Alex", email: "alex@example.test" },
  created_at: "2026-11-01T10:00:00Z", last_activity_at: "2026-11-01T10:00:00Z", is_read: true,
  has_unread_reply: false, status: "new", archived: false };

beforeEach(() => {
  vi.resetAllMocks(); mocks.detail = true; mocks.events = [];
  mocks.allowed.mockResolvedValue([{ id: site, name: "Example", subdomain: "example" }]);
  mocks.page.mockResolvedValue({ rows: [lead], count: 1 });
  mocks.rpc.mockImplementation(async (name: string) => name === "is_super_admin"
    ? { data: false, error: null } : { data: { received: 1, awaiting: 0, won_month: 0, won: 0, lost: 0 }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: mocks.detail && table === "form_submissions" ? lead : null, error: null }),
      returns: async () => ({ data: table === "lead_events" ? mocks.events : [], error: null }),
    };
    return query;
  });
});

async function render(params: Record<string, string>) {
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<FormsPage params={Promise.resolve({})} searchParams={Promise.resolve(params)} />, { onError: (error) => { errors.push(error); } });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("lead detail navigation", () => {
  it("opens existing lead links in a full view and preserves list filters for the back link", async () => {
    const html = await render({ lead: id, site, status: "new", q: "roof", page: "2" });
    expect(html).toContain(`href="/dashboard/forms?site=${site}&amp;status=new&amp;q=roof&amp;page=2"`);
    expect(html).toContain("Back to leads");
    expect(html).toContain("Reply conversation");
    expect(html).toContain("Note form");
    expect(html).not.toContain('aria-label="Lead inbox"');
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("links from the filtered list and offers a return when the lead is unavailable", async () => {
    const list = await render({ q: "roof", page: "2" });
    expect(list).toContain(`href="/dashboard/leads/${id}?q=roof&amp;page=2"`);
    mocks.detail = false;
    const missing = await render({ lead: id, q: "roof" });
    expect(missing).toContain('href="/dashboard/forms?q=roof"');
    expect(missing).toContain("That lead is unavailable");
  });

  it("links timeline messages with their selected ID and keeps list filters", async () => {
    const message = "00000000-0000-4000-8000-000000000003";
    mocks.events = [{ id: "event", type: "email_sent", data: { message_id: message }, created_at: lead.created_at }];
    const html = await render({ lead: id, q: "roof" });
    expect(html).toContain(`href="/dashboard/forms?q=roof&amp;lead=${id}&amp;message=${message}#message-${message}"`);
  });
});
