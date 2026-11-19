import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instructionEmail, notifyDomainLive, sendDomainEmail } from "./email";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), update: vi.fn(), claim: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
const site = { id: "site", account_id: "account", custom_domain: "example.com", domain_pending_since: "2026-11-17T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("POSTMARK_SERVER_TOKEN", "test-email-token");
  vi.stubEnv("POSTMARK_FROM_EMAIL", "Agency <sites@agency.example>");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ MessageID: "sent", ErrorCode: 0 }));
  mocks.claim.mockResolvedValueOnce({ data: site, error: null }).mockResolvedValue({ data: null, error: null });
  mocks.update.mockImplementation(() => {
    const query = { eq: () => query, is: () => query, not: () => query, or: () => query,
      select: () => query, maybeSingle: mocks.claim,
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  });
  mocks.admin.mockReturnValue({ from: (table: string) => {
    if (table === "sites") return { update: mocks.update };
    if (table === "profiles") return { select: () => ({ in: async () => ({ data: [{ email: "owner@example.com" }], error: null }) }) };
    const members = { eq: () => members,
      then: (resolve: (value: { data: { user_id: string }[]; error: null }) => unknown) =>
        Promise.resolve({ data: [{ user_id: "owner" }], error: null }).then(resolve) };
    return { select: () => members };
  } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("domain emails", () => {
  it("uses agency sender details and exact server-generated instructions without exposing tokens in the message", async () => {
    const text = instructionEmail("example.com", "godaddy", [
      { type: "A", name: "example.com", value: "192.0.2.1" },
      { type: "TXT", name: "_verify.example.com", value: "ownership-token" },
    ]);
    await sendDomainEmail(["web@example.com"], "Connect example.com", text, "instructions-key");
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.postmarkapp.com/email");
    expect(new Headers(init.headers).get("X-Postmark-Server-Token")).toBe("test-email-token");
    const body = JSON.parse(init.body);
    expect(body.From).toBe("Agency <sites@agency.example>");
    expect(body.Tag).toBe("domain");
    expect(body.TextBody).toContain("A | example.com | 192.0.2.1");
    expect(body.TextBody).toContain("TXT | _verify.example.com | ownership-token");
    expect(body.HtmlBody).toContain("GoDaddy");
    expect(init.body).not.toContain("test-email-token");
  });

  it("skips optional live emails without a key but explicitly fails on-demand sends", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "");
    await notifyDomainLive("site");
    expect(mocks.admin).not.toHaveBeenCalled();
    await expect(sendDomainEmail(["web@example.com"], "Subject", "Body", "key")).rejects.toThrow("not configured");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not claim delivery when a successful HTTP response has no email ID", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({}));
    await expect(sendDomainEmail(["web@example.com"], "Subject", "Body", "key")).rejects.toThrow("did not confirm");
  });

  it("claims and marks a live notification so subsequent jobs do not send it again", async () => {
    await notifyDomainLive("site");
    await notifyDomainLive("site");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.To).toBe("owner@example.com");
    expect(body.Subject).toBe("Your domain is live");
    expect(body.TextBody).toContain("https://example.com");
    expect(mocks.update).toHaveBeenCalledWith({
      domain_notification_sent_at: expect.any(String), domain_notification_claimed_at: null,
    });
  });

  it("releases a failed notification for retry with the same opaque reference", async () => {
    mocks.claim.mockReset().mockResolvedValue({ data: site, error: null });
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: "Private provider detail" }, { status: 503 }));
    await expect(notifyDomainLive("site")).rejects.toThrow("Could not send");
    expect(mocks.update).toHaveBeenCalledWith({ domain_notification_claimed_at: null });
    await notifyDomainLive("site");
    const references = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).Metadata.notification_ref);
    expect(references[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(references[0]).toBe(references[1]);
  });
});
