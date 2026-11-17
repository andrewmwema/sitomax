import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainSite } from "@/lib/domains";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), batches: vi.fn(), emails: vi.fn(), check: vi.fn(), notify: vi.fn(),
  requestEmails: vi.fn(), notifyRequest: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/domains/check", () => ({
  domainSiteColumns: "id,custom_domain", checkAndSaveDomain: mocks.check,
}));
vi.mock("@/lib/domains/email", () => ({ notifyDomainLive: mocks.notify }));
vi.mock("@/lib/domains/request-email", () => ({ notifyDomainRequestDone: mocks.notifyRequest }));
import { GET } from "./route";
const site: DomainSite = { id: "00000000-0000-4000-8000-000000000001", name: "Client", subdomain: "client",
  custom_domain: "example.com", domain_verified: false, domain_provider: "godaddy",
  domain_pending_since: new Date().toISOString(), domain_check_stopped_at: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.batches.mockResolvedValue({ data: [], error: null });
  mocks.emails.mockResolvedValue({ data: [], error: null });
  mocks.requestEmails.mockResolvedValue({ data: [], error: null });
  mocks.notifyRequest.mockResolvedValue(undefined);
  mocks.check.mockResolvedValue({ site, connection: { status: "Connected" } });
  mocks.notify.mockResolvedValue(undefined);
  mocks.admin.mockReturnValue({ from: (table: string) => ({ select: (columns: string) => {
    const query = { not: () => query, eq: () => query, is: () => query, or: () => query,
      gt: () => query, order: () => query, limit: table === "domain_requests" ? mocks.requestEmails : columns === "id" ? mocks.emails : mocks.batches };
    return query;
  } }) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (secret = "test-cron-secret") => new Request("https://agency.example/api/cron/domains", {
  headers: { authorization: `Bearer ${secret}` },
});
describe("scheduled domain checks", () => {
  it("fails closed without a configured matching cron secret", async () => {
    expect((await GET(request("incorrect"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request(""))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("checks all paginated pending domains automatically", async () => {
    mocks.batches.mockResolvedValueOnce({ data: [site], error: null })
      .mockResolvedValueOnce({ data: [{ ...site, id: "second-site", custom_domain: "other.example" }], error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 2, failed: 0, more: false });
    expect(mocks.check).toHaveBeenCalledWith(site, true);
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("retries unsent live notifications even when no pending sites remain", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-token");
    mocks.emails.mockResolvedValueOnce({ data: [{ id: site.id }], error: null });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(site.id);
  });

  it("reports partial failures without hiding successful domain checks", async () => {
    mocks.batches.mockResolvedValueOnce({ data: [site, { ...site, id: "second" }], error: null });
    mocks.check.mockRejectedValueOnce(new Error("Service unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ checked: 1, failed: 1 });
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });

  it("retries completed request emails separately from live-domain notifications", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-token");
    mocks.requestEmails.mockResolvedValueOnce({ data: [{ id: site.id }], error: null });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.notifyRequest).toHaveBeenCalledWith(site.id);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
