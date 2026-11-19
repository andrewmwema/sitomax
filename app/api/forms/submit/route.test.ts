import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ site: vi.fn(), rpc: vi.fn(), after: vi.fn(), send: vi.fn(), owners: vi.fn(), configured: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(),
  sendEmail: mocks.send, isEmailConfigured: mocks.configured }));
vi.mock("@/lib/email/recipients", () => ({ getAccountOwnerEmails: mocks.owners }));
vi.mock("@/lib/tenant", () => ({
  getTenantKeyFromHost: (host: string) => host === "agency.test" ? "sitomax" : host,
  getSiteByHost: mocks.site,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { POST } from "./route";

function request(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request("https://client.test/api/forms/submit", {
    method: "POST",
    headers: { host: "client.test", "x-forwarded-for": "203.0.113.10", ...headers },
    body: new URLSearchParams(fields),
  });
}
const valid = { _form_name: "contact", _website: "", _page_path: "/contact", Name: "Alex", Email: "a@example.test" };

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret");
  mocks.site.mockResolvedValue({ id: "site-1", account_id: "account-1", name: "Acme" });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.configured.mockReturnValue(false);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("form submission endpoint", () => {
  it("resolves the host and saves a validated submission without storing the IP", async () => {
    expect((await POST(request(valid))).status).toBe(200);
    expect(mocks.site).toHaveBeenCalledWith("client.test");
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("submit_contact_form");
    expect(args).toMatchObject({ p_site_id: "site-1", p_form_name: "contact", p_path: "/contact", p_data: { Name: "Alex", Email: "a@example.test" } });
    expect(args.p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain("203.0.113.10");
  });
  it("uses the marketing tenant for submissions posted to the root domain", async () => {
    const req = new Request("https://agency.test/api/forms/submit", {
      method: "POST",
      headers: { host: "agency.test", "x-forwarded-for": "203.0.113.10" },
      body: new URLSearchParams(valid),
    });
    expect((await POST(req)).status).toBe(200);
    expect(mocks.site).toHaveBeenCalledWith("sitomax");
  });
  it("drops honeypot submissions without touching the database", async () => {
    expect((await POST(request({ ...valid, _website: "spam" }))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized, cross-origin and preview submissions", async () => {
    expect((await POST(request({ ...valid, _page_path: "/?secret=1" }))).status).toBe(400);
    expect((await POST(request({ ...valid, Name: "x".repeat(33000) }))).status).toBe(413);
    expect((await POST(request(valid, { origin: "https://other.test" }))).status).toBe(403);
    expect((await POST(request(valid, { referer: "https://client.test/?preview=1" }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("surfaces rate limits and database failures, and fails closed without an IP", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await POST(request(valid))).status).toBe(429);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    expect((await POST(request(valid))).status).toBe(500);
    expect((await POST(request(valid, { "x-forwarded-for": "unknown" }))).status).toBe(503);
  });
  it("combines repeated field labels without losing values", async () => {
    const body = new URLSearchParams(valid); body.append("Name", "Sam");
    const req = new Request("https://client.test/api/forms/submit", { method: "POST", headers: { host: "client.test", "x-forwarded-for": "203.0.113.10" }, body });
    expect((await POST(req)).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].p_data.Name).toBe("Alex\nSam");
  });

  it("notifies only the saved site's owners without including submitted fields", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.owners.mockResolvedValue(["owner@example.test"]);
    expect((await POST(request(valid))).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.owners).toHaveBeenCalledWith(expect.anything(), "account-1");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ["owner@example.test"], tag: "form-notification",
      text: expect.stringContaining("/dashboard/forms"), html: expect.stringContaining("/dashboard/forms"),
    }));
    expect(JSON.stringify(mocks.send.mock.calls)).not.toContain(valid.Email);
  });

  it("does not schedule an email for a rejected submission", async () => {
    mocks.configured.mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request(valid))).status).toBe(429);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
