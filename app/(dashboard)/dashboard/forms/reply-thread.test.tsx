import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/forms/submissions";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), selected: null as unknown }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }) }));
vi.mock("@/components/dashboard/lead-reply-composer", () => ({ LeadReplyComposer: () => <div>Composer</div> }));
import { requireUser } from "@/lib/auth";
import { LeadReplyThread } from "./reply-thread";

const leadId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const inboundId = "00000000-0000-4000-8000-000000000003";
const outboundId = "00000000-0000-4000-8000-000000000004";
const lead: Lead = { id: leadId, site_id: leadId, form_name: "Contact", page_path: "/", data: { name: "Alex" },
  created_at: "2026-01-01T00:00:00Z", last_activity_at: "2026-01-01T00:00:00Z", is_read: true,
  has_unread_reply: false, status: "new", archived: false };
const messages = [
  { id: inboundId, direction: "in", subject: "Re", body_html: "<p>Thanks</p>", body_text: "Thanks",
    forward_text: "Thanks\n\n> Previous message", actor_id: null, delivery_state: "received", delivery_status: null,
    delivery_status_at: null, auto_reply: false, has_attachments: false, created_at: "2026-01-03T00:00:00Z", lead_reply_forwards: [] },
  { id: outboundId, direction: "out", subject: "Hello", body_html: "<p>Hello</p>", body_text: "Hello",
    forward_text: null, actor_id: actorId, delivery_state: "sent", delivery_status: "delivered",
    delivery_status_at: "2026-01-02T00:01:00Z", auto_reply: false, has_attachments: false, created_at: "2026-01-02T00:00:00Z", lead_reply_forwards: [] },
];

beforeEach(() => {
  vi.resetAllMocks(); mocks.selected = null;
  mocks.rpc.mockImplementation(async (name: string) => name === "lead_reply_senders"
    ? { data: [{ actor_id: actorId, name: "Andrew" }], error: null }
    : { data: { email: "alex@example.test", mode: "tracked", direct_to: null }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query, not: () => query,
      returns: async () => ({ data: table === "lead_messages" ? messages : [], error: null }),
      maybeSingle: async () => ({ data: table === "sites"
        ? { name: "Site", subdomain: "site", business: {}, custom_domain: null, domain_verified: false }
        : table === "agency_settings" ? { name: "Agency" } : mocks.selected, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  });
});

async function render(selectedMessage?: string) {
  const { supabase } = await requireUser();
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(<LeadReplyThread lead={lead} supabase={supabase} selectedMessage={selectedMessage} />, {
    onError: (error) => { errors.push(error); },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  if (errors.length) throw errors[0];
  return html;
}

describe("lead conversation", () => {
  it("orders the thread, labels the author and delivery, and collapses quoted email", async () => {
    const html = await render();
    expect(html.indexOf(`message-${outboundId}`)).toBeLessThan(html.indexOf(`message-${inboundId}`));
    expect(html.indexOf(`message-${inboundId}`)).toBeLessThan(html.indexOf("Composer"));
    expect(html).toContain("Andrew<!-- --> · via Agency");
    expect(html).toContain("Delivered");
    expect(html).toContain("2026-01-02T00:01:00Z");
    expect(html).toContain("<details");
    expect(html).toContain("Show full email and quoted text");
    expect(html).toContain("&gt; Previous message");
  });

  it("reports an unavailable timeline message", async () => {
    expect(await render(inboundId)).toContain("That message is unavailable");
  });

  it("includes an older selected message without duplicating recent messages", async () => {
    const old = { ...messages[0], id: "00000000-0000-4000-8000-000000000005", created_at: "2025-01-01T00:00:00Z" };
    mocks.selected = old;
    const html = await render(old.id);
    expect(html.indexOf(`message-${old.id}`)).toBeLessThan(html.indexOf(`message-${outboundId}`));
    expect(html).not.toContain("That message is unavailable");
  });
});
