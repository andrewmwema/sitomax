import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), update: vi.fn(), claim: vi.fn(), site: vi.fn(), owners: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/domains/email", async (original) => {
  const actual = await original<typeof import("@/lib/domains/email")>();
  return { ...actual, getAccountOwnerEmails: mocks.owners, sendDomainEmail: mocks.send };
});
import { DomainEmailError } from "./email";
import { notifyDomainRequestDone } from "./request-email";
const request = { id: "request", site_id: "site", domain: "example.com", done_at: "2026-11-17T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("RESEND_API_KEY", "test-token");
  mocks.claim.mockResolvedValueOnce({ data: request, error: null }).mockResolvedValue({ data: null, error: null });
  mocks.site.mockResolvedValue({ data: { account_id: "account" }, error: null });
  mocks.owners.mockResolvedValue(["owner1@example.com", "owner2@example.com"]);
  mocks.send.mockResolvedValue(undefined);
  mocks.update.mockImplementation(() => {
    const query = { eq: () => query, is: () => query, or: () => query, select: () => query, maybeSingle: mocks.claim,
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  });
  mocks.admin.mockReturnValue({ from: (table: string) => table === "domain_requests" ? { update: mocks.update } :
    { select: () => ({ eq: () => ({ maybeSingle: mocks.site }) }) } });
});
afterEach(() => vi.unstubAllEnvs());
describe("domain request completion notifications", () => {
  it("notifies current account owners once, rather than only the original submitter", async () => {
    await notifyDomainRequestDone("request");
    await notifyDomainRequestDone("request");
    expect(mocks.owners).toHaveBeenCalledWith(expect.anything(), "account");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(["owner1@example.com", "owner2@example.com"],
      "Your domain setup request is complete", expect.stringContaining("example.com"), expect.stringContaining(request.done_at));
    expect(mocks.update).toHaveBeenCalledWith({ notification_sent_at: expect.any(String), notification_claimed_at: null });
    expect(mocks.send.mock.calls[0][2]).toContain("revoke our delegated access");
  });
  it("leaves failed deliveries retryable with the same idempotency key", async () => {
    mocks.claim.mockReset().mockResolvedValue({ data: request, error: null });
    mocks.send.mockRejectedValueOnce(new DomainEmailError("Temporary email failure."));
    await expect(notifyDomainRequestDone("request")).rejects.toThrow("Temporary email failure.");
    expect(mocks.update).toHaveBeenCalledWith({ notification_claimed_at: null });
    await notifyDomainRequestDone("request");
    expect(mocks.send.mock.calls[0][3]).toBe(mocks.send.mock.calls[1][3]);
  });
  it("reports missing email configuration without claiming notification success", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyDomainRequestDone("request")).rejects.toThrow("not configured");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
