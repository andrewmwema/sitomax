import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), worker: vi.fn(), update: vi.fn(), render: vi.fn(), ai: vi.fn(),
  mode: "tracked" as "tracked" | "direct", direct: null as string | null, admin: false }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "owner" }, supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    const data = table === "form_submissions" ? { site_id: "site", data: { name: "Alex", message: "Need a quote" }, created_at: "2026-11-01T10:00:00Z" } :
      table === "lead_messages" ? { direction: "in", body_text: "Is Tuesday free?\n\nOn Nov 1, 2026, Site wrote:\n> Hello", created_at: "2026-11-03T09:00:00Z" } :
      table === "sites" ? { id: "site", account_id: "account", name: "Site", subdomain: "site", business: {}, custom_domain: null, domain_verified: false } :
      table === "agency_settings" ? { name: "Agency", show_lead_email_branding: false } : null;
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data, error: null }),
      update: (values: unknown) => { mocks.update(table, values); return { eq: () => ({ select: async () => ({ data: [{ id: "lead" }], error: null }) }) }; },
    };
    return query;
  },
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(),
  sendEmail: mocks.send, isEmailConfigured: () => true }));
vi.mock("@/lib/leads/reply-worker", () => ({ leadReplyWorker: mocks.worker }));
vi.mock("@/lib/ai/client", () => ({ requestAi: mocks.ai }));
vi.mock("@/emails/registry", () => ({
  renderOutgoingLeadReplyEmail: async (input: { subject: string }) => {
    mocks.render(input);
    return { subject: input.subject, html: "<p>Hello</p>", text: "Hello", preheader: "Reply" };
  },
}));
import { EmailDeliveryError } from "@/lib/email";
import { draftLeadReply, sendLeadReply } from "./reply-actions";

const input = { leadId: "00000000-0000-4000-8000-000000000001", requestId: "00000000-0000-4000-8000-000000000002",
  subject: "Reply", html: "<p>Hello</p>", bcc: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LEADS_FROM_DOMAIN", "outbound.example.test");
  vi.stubEnv("POSTMARK_LEADS_STREAM", "lead-transactional");
  vi.stubEnv("INBOUND_REPLY_DOMAIN", "inbound.example.test");
  vi.stubEnv("LEAD_REPLY_TOKEN_SECRET", "test-token-secret-at-least-32-characters");
  mocks.mode = "tracked"; mocks.direct = null; mocks.admin = false;
  mocks.rpc.mockImplementation((name: string) => name === "is_super_admin" ? { data: mocks.admin, error: null }
    : name === "lead_inbox_action" ? { data: 1, error: null }
    : { data: { email: "lead@example.test", mode: mocks.mode, direct_to: mocks.direct,
      owner_copy: null, bounced: false, undeliverable: false, archived: false }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("lead reply configuration", () => {
  it("reports a reservation failure instead of collapsing it into a generic send error", async () => {
    mocks.worker.mockReturnValue({
      secret: "test-worker-secret-at-least-32-characters",
      client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }) },
    });
    expect(await sendLeadReply(input)).toEqual({
      error: "Could not reserve this reply. Refresh the conversation before retrying.",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("explains when tracked replies are not configured", async () => {
    vi.stubEnv("INBOUND_REPLY_DOMAIN", "");
    expect(await sendLeadReply(input)).toEqual({ error: "Tracked replies are not configured. Contact your agency." });
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("explains when direct reply routing has no eligible mailbox", async () => {
    mocks.mode = "direct";
    expect(await sendLeadReply(input)).toEqual({ error: "No eligible reply mailbox. Add a notification recipient in Lead settings." });
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports a missing worker without attempting a send", async () => {
    mocks.worker.mockImplementation(() => { throw new EmailDeliveryError("Lead email worker is not configured. Contact your agency."); });
    expect(await sendLeadReply(input)).toEqual({ error: "Lead email worker is not configured. Contact your agency." });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("sending a lead reply", () => {
  const reserved = () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "reserve_lead_reply" ? "reserved" : true, error: null }));
    mocks.worker.mockReturnValue({ secret: "test-worker-secret-at-least-32-characters", client: { rpc } });
    return rpc;
  };

  it("sends the signature and the newest message as quoted history, then archives on request", async () => {
    reserved();
    mocks.send.mockResolvedValue({ messageId: "provider-id" });
    const result = await sendLeadReply({ ...input, signature: "Sam Lee  \nSite\n", quote: true, after: "archive" });
    expect(result).toEqual({ success: "Reply sent." });
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      bodyHtml: "<p>Hello</p>", signature: "Sam Lee\nSite",
      quote: { header: "On Nov 3, 2026, Alex wrote:", text: "Is Tuesday free?" },
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("lead_inbox_action", expect.objectContaining({ p_action: "archive", p_lead_ids: [input.leadId] }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("marks the lead Won only after the email was accepted", async () => {
    reserved();
    mocks.send.mockResolvedValueOnce({ messageId: "provider-id" });
    expect(await sendLeadReply({ ...input, after: "won" })).toEqual({ success: "Reply sent." });
    expect(mocks.update).toHaveBeenCalledWith("form_submissions", { status: "won" });
    expect(mocks.render).toHaveBeenLastCalledWith(expect.objectContaining({ signature: "", quote: null }));

    mocks.update.mockClear();
    mocks.send.mockRejectedValueOnce(new EmailDeliveryError("The email service did not confirm delivery."));
    expect(await sendLeadReply({ ...input, after: "won" })).toEqual({ error: "The email service did not confirm delivery.", reserved: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses placeholders left in the signature", async () => {
    expect(await sendLeadReply({ ...input, signature: "Sam\n[phone]" })).toEqual({ error: "Replace all bracketed placeholders before sending." });
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("gives the technical cause to the agency only", async () => {
    mocks.admin = true;
    mocks.worker.mockReturnValue({
      secret: "test-worker-secret-at-least-32-characters",
      client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }) },
    });
    expect(await sendLeadReply(input)).toEqual({
      error: "Could not reserve this reply. Refresh the conversation before retrying.",
      detail: "reserve_lead_reply failed (42501).",
    });
  });
});

describe("improving a draft with AI", () => {
  const answer = (text: string) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "draft_lead_reply", input: { text } }] });
  const request = { leadId: input.leadId, tone: "improve", draft: "call me on +1 555 010 0199 or sam@example.test , thx" };

  it("keeps contact details away from the model and restores them in the result", async () => {
    mocks.ai.mockResolvedValue(answer("Please call me on {{keep_1}} or email {{keep_2}}. Thank you."));
    expect(await draftLeadReply(request)).toEqual({ html: "<p>Please call me on +1 555 010 0199 or email sam@example.test. Thank you.</p>" });
    const sent = JSON.stringify(mocks.ai.mock.calls[0][0].messages);
    expect(sent).toContain("{{keep_1}}");
    expect(sent).not.toContain("555 010");
    expect(sent).not.toContain("sam@example.test");
  });

  it("rejects a result that dropped a kept detail, and needs a draft to improve", async () => {
    mocks.ai.mockResolvedValue(answer("Please email {{keep_2}}. Thank you."));
    expect(await draftLeadReply(request)).toEqual({ error: "Could not draft a reply. Check available AI credits or write the reply manually." });
    expect(await draftLeadReply({ ...request, draft: "  " })).toEqual({ error: "Write a draft before asking to improve it." });
  });
});

