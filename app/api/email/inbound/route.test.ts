import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), after: vi.fn(), send: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/brand", () => ({ brand: { appUrl: "https://app.example.test", name: "Agency" } }));
vi.mock("@/lib/leads/reply-worker", () => ({ leadReplyWorker: () => ({ client: { rpc: mocks.rpc }, secret: "test-worker" }) }));
vi.mock("@/lib/email", async (load) => ({ ...await load<typeof import("@/lib/email")>(), sendEmail: mocks.send }));
import { replyAddress, verifyReplyAddress } from "@/lib/leads/reply-token";
import { outboundReplyTo } from "@/lib/leads/reply-mail";
import { POST } from "./route";

const lead = "00000000-0000-4000-8000-000000000001";
const message = "00000000-0000-4000-8000-000000000002";
const lease = "00000000-0000-4000-8000-000000000003";
const token = "test-only-thread-secret-32-characters";
const domain = "inbound.example.test";
const address = replyAddress(lead, domain, token);
const original = {
  MessageID: "postmark-message", FromFull: { Email: "Lead@example.test" }, ToFull: [{ Email: address }],
  Subject: "Re: Your quote", TextBody: "This is the whole reply.\n\nOn Monday someone wrote:\n> Previous note",
  StrippedTextReply: "This is the whole reply.", HtmlBody: "<p>text</p><script>hidden</script>",
  Headers: [{ Name: "In-Reply-To", Value: "<previous@example.test>" }], Attachments: [{ Name: "photo" }],
};
const auth = `Basic ${Buffer.from("postmark:fixture-password").toString("base64")}`;
function inbound(body: unknown, authorization = auth, host = "app.example.test") {
  return new Request(`https://${host}/api/email/inbound`, {
    method: "POST", headers: { authorization, host }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("POSTMARK_INBOUND_WEBHOOK_USER", "postmark");
  vi.stubEnv("POSTMARK_INBOUND_WEBHOOK_PASSWORD", "fixture-password");
  vi.stubEnv("INBOUND_REPLY_DOMAIN", domain);
  vi.stubEnv("LEAD_REPLY_TOKEN_SECRET", token);
  vi.stubEnv("LEADS_FROM_DOMAIN", "outbound.example.test");
  vi.stubEnv("POSTMARK_LEADS_STREAM", "lead-transactional");
});

describe("lead inbound and forwarding", () => {
  it("authenticates, stores the stripped reply, then forwards full text to the site's resolved recipient only", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: message }).mockResolvedValueOnce({ data: [{
      message_id: message, lease_id: lease, lead_id: lead, recipient: "owner-a@example.test", lead_name: "Lead",
      business: "Acme", lead_email: "lead@example.test", subject: original.Subject,
      body_text: original.TextBody, original_text: "Our original reply", has_attachments: true,
    }] }).mockResolvedValueOnce({ data: true });
    expect((await POST(inbound(original))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "store_lead_inbound", expect.objectContaining({
      p_lead: lead, p_from: "lead@example.test", p_text: original.StrippedTextReply, p_full_text: original.TextBody,
      p_html: "<p>This is the whole reply.</p>", p_in_reply_to: "<previous@example.test>", p_attachments: true,
    }));
    expect(mocks.send).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "claim_lead_reply_forwards", expect.objectContaining({ p_message: message }));
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: "owner-a@example.test", replyTo: "lead@example.test", subject: original.Subject,
      text: expect.stringContaining(original.TextBody), html: expect.stringContaining("Our original reply"),
      tag: "lead-forward", stream: "lead-transactional",
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "finish_lead_reply_forward", expect.objectContaining({ p_sent: true, p_lease: lease }));
  });

  it("does not store or forward invalid tokens, requests from other hosts, or bad credentials", async () => {
    expect((await POST(inbound(original, "Basic bad"))).status).toBe(401);
    expect((await POST(inbound(original, auth, "client.example.test"))).status).toBe(404);
    const invalid = { ...original, ToFull: [{ Email: address.replace(/\.([^@])(?=[^@]*@)/, (_, first) => `.${first === "a" ? "b" : "a"}`) }] };
    expect((await POST(inbound(invalid))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("archives automatic replies without scheduling a forward; strips quoted text if no provider excerpt exists", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: message });
    const mail = { ...original, StrippedTextReply: "", Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] };
    expect((await POST(inbound(mail))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("store_lead_inbound", expect.objectContaining({
      p_auto: true, p_text: "This is the whole reply.",
    }));
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("routes direct replies straight to the owner's mailbox and rejects cross-domain signed addresses", () => {
    expect(outboundReplyTo(lead, { mode: "direct", direct_to: "Owner@example.test" })).toBe("owner@example.test");
    expect(outboundReplyTo(lead, { mode: "tracked", direct_to: "owner@example.test" })).toBe(address);
    expect(verifyReplyAddress(address.replace(domain, "other.example.test"), domain, token)).toBeNull();
    expect(verifyReplyAddress(address.split("@")[0].slice(6), domain, token, true)).toBe(lead);
    expect(address.split("@")[0].length).toBeLessThanOrEqual(64);
  });
});
