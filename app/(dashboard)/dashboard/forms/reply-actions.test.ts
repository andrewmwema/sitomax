import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), worker: vi.fn(), mode: "tracked" as "tracked" | "direct", direct: null as string | null }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "owner" }, supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    const data = table === "form_submissions" ? { site_id: "site", data: {} } :
      table === "sites" ? { id: "site", account_id: "account", name: "Site", subdomain: "site", business: {}, custom_domain: null, domain_verified: false } :
      table === "agency_settings" ? { name: "Agency", show_lead_email_branding: false } : null;
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data, error: null }) };
    return query;
  },
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(),
  sendEmail: mocks.send, isEmailConfigured: () => true }));
vi.mock("@/lib/leads/reply-worker", () => ({ leadReplyWorker: mocks.worker }));
vi.mock("@/emails/registry", () => ({
  renderOutgoingLeadReplyEmail: vi.fn(async ({ subject }: { subject: string }) => ({
    subject, html: "<p>Hello</p>", text: "Hello", preheader: "Reply",
  })),
}));
import { EmailDeliveryError } from "@/lib/email";
import { sendLeadReply } from "./reply-actions";

const input = { leadId: "00000000-0000-4000-8000-000000000001", requestId: "00000000-0000-4000-8000-000000000002",
  subject: "Reply", html: "<p>Hello</p>", bcc: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LEADS_FROM_DOMAIN", "outbound.example.test");
  vi.stubEnv("POSTMARK_LEADS_STREAM", "lead-transactional");
  vi.stubEnv("INBOUND_REPLY_DOMAIN", "inbound.example.test");
  vi.stubEnv("LEAD_REPLY_TOKEN_SECRET", "test-token-secret-at-least-32-characters");
  mocks.mode = "tracked"; mocks.direct = null;
  mocks.rpc.mockImplementation(() => ({ data: { email: "lead@example.test", mode: mocks.mode, direct_to: mocks.direct,
    owner_copy: null, bounced: false, undeliverable: false, archived: false }, error: null }));
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
