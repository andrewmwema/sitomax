import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainSite } from "@/lib/domains";

const mocks = vi.hoisted(() => ({
  site: vi.fn(), rpc: vi.fn(), admin: vi.fn(), update: vi.fn(), saved: vi.fn(), conflict: vi.fn(),
  connection: vi.fn(), remove: vi.fn(), revalidate: vi.fn(),
  inspect: vi.fn(), notify: vi.fn(), send: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.site }) }) }),
  rpc: mocks.rpc,
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/vercel/domains", async (original) => {
  const actual = await original<typeof import("@/lib/vercel/domains")>();
  return { ...actual, getDomainConnection: mocks.connection, removeDomain: mocks.remove };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/domains/dns", async (original) => {
  const actual = await original<typeof import("@/lib/domains/dns")>();
  return { ...actual, inspectDns: mocks.inspect };
});
vi.mock("@/lib/domains/email", async (original) => {
  const actual = await original<typeof import("@/lib/domains/email")>();
  return { ...actual, notifyDomainLive: mocks.notify, sendDomainEmail: mocks.send };
});
import { DomainApiError } from "@/lib/vercel/domains";
import { checkSiteDomain, connectSiteDomain, emailDomainInstructions, inspectSiteDomain, loadDomainSettings, removeSiteDomain } from "./actions";

const id = "00000000-0000-4000-8000-000000000001";
const site: DomainSite = { id, name: "Client", subdomain: "client", custom_domain: null, domain_verified: false,
  domain_provider: null, domain_pending_since: new Date().toISOString(), domain_check_stopped_at: null };
const connectedSite = { ...site, custom_domain: "example.com" };
const connection = { status: "Connected", records: [], issue: "" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.site.mockResolvedValue({ data: { ...site, account_id: id }, error: null });
  mocks.rpc.mockImplementation(async (name) => ({ data: name === "is_account_owner" || name === "consume_domain_action", error: null }));
  mocks.conflict.mockResolvedValue({ data: [], error: null });
  mocks.saved.mockResolvedValue({ data: connectedSite, error: null });
  mocks.update.mockImplementation(() => {
    const query = { eq: () => query, is: () => query, select: () => query, maybeSingle: mocks.saved };
    return query;
  });
  mocks.admin.mockReturnValue({ from: () => ({
    select: () => ({ in: () => ({ neq: mocks.conflict }) }), update: mocks.update,
  }) });
  mocks.connection.mockResolvedValue(connection);
  mocks.remove.mockResolvedValue(undefined);
  mocks.inspect.mockImplementation(async (domain, consume) => {
    await consume();
    return { domain, providerId: "godaddy", nameservers: ["ns1.domaincontrol.com"], records: [] };
  });
  mocks.notify.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue(undefined);
});
function existingDomain() {
  mocks.site.mockResolvedValue({ data: { ...connectedSite, account_id: id }, error: null });
}

describe("domain action permissions", () => {
  it("denies editors across reads and every mutation without using privileged clients or hosting", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    for (const result of [
      await loadDomainSettings(id), await connectSiteDomain(id, "example.com"),
      await checkSiteDomain(id), await removeSiteDomain(id),
      await inspectSiteDomain(id, "example.com"), await emailDomainInstructions(id, "web@example.com", "godaddy"),
    ]) expect(result.error).toContain("Only account owners");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("allows super admins without membership and fails closed on permission lookup errors", async () => {
    mocks.rpc.mockImplementation(async (name) => ({ data: name === "is_super_admin" || name === "consume_domain_action", error: null }));
    expect((await connectSiteDomain(id, "example.com")).error).toBe("");
    mocks.rpc.mockResolvedValue({ data: true, error: { message: "database unavailable" } });
    expect((await checkSiteDomain(id)).error).toContain("permissions");
  });

  it("rejects malformed, reserved and unavailable domains before any external changes", async () => {
    vi.stubEnv("ROOT_DOMAIN", "agency.example");
    try {
      for (const input of ["https://example.com/path", "agency.example", "client.agency.example", "client.vercel.app"]) {
        expect((await connectSiteDomain(id, input)).error).toBeTruthy();
      }
      expect((await connectSiteDomain("invalid", "example.com")).error).toBeTruthy();
      mocks.conflict.mockResolvedValue({ data: [{ id: "another-site" }], error: null });
      expect((await connectSiteDomain(id, "example.com")).error).toContain("another site");
      expect(mocks.connection).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("domain actions", () => {
  it("does not claim a ready domain is active until its verified status is saved", async () => {
    existingDomain();
    const result = await loadDomainSettings(id);
    expect(result.connection?.status).toBe("Pending");
    expect(result.connection?.issue).toContain("activate");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("reserves the normalized domain, attaches its redirect and saves verified status", async () => {
    mocks.saved.mockResolvedValueOnce({ data: connectedSite, error: null })
      .mockResolvedValueOnce({ data: { ...connectedSite, domain_provider: "godaddy" }, error: null })
      .mockResolvedValueOnce({ data: { ...connectedSite, domain_verified: true }, error: null });
    const result = await connectSiteDomain(id, " HTTPS://WWW.Example.COM/ ", "godaddy");
    expect(result.error).toBe("");
    expect(result.site?.domain_verified).toBe(true);
    expect(mocks.update.mock.calls.map(([fields]) => fields)).toEqual([
      { custom_domain: "example.com", domain_verified: false }, { domain_provider: "godaddy" }, { domain_verified: true },
    ]);
    expect(mocks.connection).toHaveBeenCalledWith("example.com", { verify: true, repair: true });
    expect(mocks.notify).toHaveBeenCalledWith(id);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/sites/${id}/domains`);
  });

  it("retains a failed setup for retry and never replaces an existing domain", async () => {
    mocks.connection.mockRejectedValueOnce(new DomainApiError(503, "unavailable"));
    const result = await connectSiteDomain(id, "example.com");
    expect(result.site?.custom_domain).toBe("example.com");
    expect(result.site?.domain_verified).toBe(false);
    expect(result.error).toContain("retry");
    existingDomain();
    expect((await connectSiteDomain(id, "other.com")).error).toContain("Remove the current domain");
    expect((await connectSiteDomain(id, "example.com")).error).toBe("");
    expect(mocks.update).not.toHaveBeenCalledWith({ custom_domain: null });
  });

  it("does not call hosting when reserving the domain fails", async () => {
    mocks.saved.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await connectSiteDomain(id, "example.com")).error).toContain("Could not save");
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it("checks live verification and clears domain_verified when either hostname is not ready", async () => {
    existingDomain();
    mocks.connection.mockResolvedValue({ ...connection, status: "Needs attention" });
    const result = await checkSiteDomain(id);
    expect(result.connection?.status).toBe("Needs attention");
    expect(mocks.connection).toHaveBeenCalledWith("example.com", { verify: true, repair: true });
    expect(mocks.update).toHaveBeenCalledWith({ domain_verified: false });
    mocks.connection.mockRejectedValue(new DomainApiError(503, "unavailable"));
    mocks.update.mockClear();
    expect((await checkSiteDomain(id)).error).toBeTruthy();
    expect(mocks.update).toHaveBeenCalledWith({ domain_last_checked_at: expect.any(String) });
    expect(mocks.update).not.toHaveBeenCalledWith({ domain_verified: false });
  });

  it("keeps the saved domain pending with TXT instructions if its retry finds an outside connection", async () => {
    existingDomain();
    const blocked = {
      status: "Needs attention",
      issue: "This domain is in use elsewhere. Add the exact TXT name and value from the DNS instructions.",
      records: [{ type: "TXT", name: "_vercel.example.com", value: "verification-token" }],
    };
    mocks.connection.mockResolvedValue(blocked);
    const result = await connectSiteDomain(id, "example.com");
    expect(result).toMatchObject({ site: { custom_domain: "example.com", domain_verified: false }, connection: blocked, success: "" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("clears domain settings only after both remote removals and surfaces partial failures", async () => {
    existingDomain();
    mocks.remove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DomainApiError(503, "unavailable"));
    const partial = await removeSiteDomain(id);
    expect(partial.error).toContain("Removal is incomplete");
    expect(partial.site?.custom_domain).toBe("example.com");
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.saved.mockResolvedValue({ data: site, error: null });
    const result = await removeSiteDomain(id);
    expect(result.error).toBe("");
    expect(result.site?.custom_domain).toBeNull();
    expect(mocks.remove.mock.calls).toEqual([
      ["www.example.com"], ["example.com"], ["www.example.com"], ["example.com"],
    ]);
    expect(mocks.update).toHaveBeenCalledWith({ custom_domain: null, domain_verified: false });
  });

  it("limits DNS lookups before resolving and validates instruction recipients and providers", async () => {
    expect((await inspectSiteDomain(id, "example.com/path")).error).toBeTruthy();
    expect(mocks.inspect).not.toHaveBeenCalled();
    mocks.rpc.mockImplementation(async (name) => ({ data: name === "is_account_owner", error: null }));
    expect((await inspectSiteDomain(id, "example.com")).error).toContain("20 per minute");
    existingDomain();
    expect((await emailDomainInstructions(id, "not-an-email", "godaddy")).error).toBeTruthy();
    expect((await emailDomainInstructions(id, "web@example.com", "untrusted")).error).toBeTruthy();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends regenerated instructions, not client-supplied records, and stops expired automatic checks", async () => {
    existingDomain();
    mocks.connection.mockResolvedValue({ ...connection, records: [
      { type: "A", name: "example.com", value: "192.0.2.1" },
      { type: "CNAME", name: "www.example.com", value: "target.example.net" },
    ] });
    expect((await emailDomainInstructions(id, "web@example.com", "godaddy")).success).toBe("Instructions sent.");
    expect(mocks.send).toHaveBeenCalledWith(["web@example.com"], "Connect example.com",
      expect.stringContaining("192.0.2.1"), expect.any(String));
    mocks.connection.mockClear();
    mocks.site.mockResolvedValue({ data: { ...connectedSite, account_id: id,
      domain_pending_since: new Date(Date.now() - 15 * 86_400_000).toISOString() }, error: null });
    expect((await checkSiteDomain(id, true)).connection?.status).toBe("Needs attention");
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ domain_check_stopped_at: expect.any(String) }));
  });
});
