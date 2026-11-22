import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lead-controls", () => ({
  LeadStarButton: ({ lead }: { lead: { id: string } }) => <button aria-label={`Star ${lead.id}`}>Star</button>,
}));

import { LeadsInboxLayout } from "./leads-inbox-layout";

const lead = {
  id: "00000000-0000-4000-8000-000000000001",
  site_id: "00000000-0000-4000-8000-000000000002",
  form_name: "Contact",
  page_path: "/contact",
  data: { name: "Alex", email: "alex@example.test" },
  created_at: "2026-11-01T10:00:00Z",
  last_activity_at: "2026-11-01T10:00:00Z",
  is_read: false,
  status: "new" as const,
  has_unread_reply: true,
  archived: false,
};

describe("LeadsInboxLayout", () => {
  it("renders views, a lead preview, and the selected conversation URL", async () => {
    const stream = await renderToReadableStream(<LeadsInboxLayout
      rows={[lead]}
      allowed={[{ id: lead.site_id, name: "Example", subdomain: "example" }]}
      counts={{ needs_reply: 1, waiting: 0, all_open: 1, starred: 0, won: 0, lost: 0, archived: 0, trash: 0 }}
      view="needs_reply"
      search=""
      site=""
      selectedLeadId={lead.id}
      conversation={<div>Conversation</div>}
      detailBackHref="/dashboard/leads?view=needs_reply"
    />);
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(html).toContain("Needs reply");
    expect(html).toContain("Alex");
    expect(html).toContain(`href="/dashboard/leads/${lead.id}?view=needs_reply"`);
    expect(html).toContain("Conversation");
  });
});
