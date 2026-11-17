import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conflictingRecords, DnsLookupError, inspectDns } from "./dns";
import { providerFromNameservers } from "./providers";

const mocks = vi.hoisted(() => ({ ns: vi.fn(), a: vi.fn(), cname: vi.fn() }));
vi.mock("node:dns", () => ({ promises: { resolveNs: mocks.ns, resolve4: mocks.a, resolveCname: mocks.cname } }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ns.mockResolvedValue(["NS1.DomainControl.COM."]);
  mocks.a.mockResolvedValue(["23.1.2.3"]);
  mocks.cname.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("DNS provider inspection", () => {
  it.each([
    ["ns1.domaincontrol.com", "godaddy"], ["dns1.registrar-servers.com", "namecheap"],
    ["ada.ns.cloudflare.com", "cloudflare"], ["ns-cloud-a1.googledomains.com", "squarespace"],
    ["ns1.wixdns.net", "wix"], ["ns1.bluehost.com", "bluehost"], ["ns12.hostgator.com", "hostgator"],
    ["ns1.dns-parking.com", "hostinger"], ["ns101.ui-dns.de", "ionos"],
    ["ns1.worldnic.com", "network-solutions"], ["curitiba.ns.porkbun.com", "porkbun"],
    ["ns-1.awsdns-01.co.uk", "route53"], ["ns1.vercel-dns.com", "vercel"],
    ["ns1.domaincontrol.com.attacker.test", "other"], ["unknown.dns.example", "other"],
  ])("detects %s without trusting a misleading suffix", (name, id) => {
    expect(providerFromNameservers([name]).id).toBe(id);
  });

  it("validates before lookup and consumes one allowance for each of the five DNS requests", async () => {
    const consume = vi.fn().mockResolvedValue(undefined);
    await expect(inspectDns("example.com/path", consume)).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
    const result = await inspectDns("HTTPS://WWW.EXAMPLE.COM/", consume);
    expect(consume).toHaveBeenCalledTimes(5);
    expect(mocks.ns).toHaveBeenCalledWith("example.com");
    expect(mocks.a.mock.calls).toEqual([["example.com"], ["www.example.com"]]);
    expect(mocks.cname.mock.calls).toEqual([["example.com"], ["www.example.com"]]);
    expect(result.providerId).toBe("godaddy");
  });

  it("blocks the 21st lookup, accepts missing records and reports DNS failures instead of guessing", async () => {
    let used = 0;
    const consume = async () => { if (++used > 20) throw new DnsLookupError("Rate limited"); };
    for (let index = 0; index < 4; index++) await inspectDns("example.com", consume);
    await expect(inspectDns("example.com", consume)).rejects.toThrow("Rate limited");
    expect(mocks.ns).toHaveBeenCalledTimes(4);
    const missing = Object.assign(new Error("Missing"), { code: "ENODATA" });
    mocks.ns.mockRejectedValue(missing); mocks.a.mockRejectedValue(missing); mocks.cname.mockRejectedValue(missing);
    expect((await inspectDns("example.com", async () => {})).records).toEqual([]);
    mocks.ns.mockRejectedValue(Object.assign(new Error("Failure"), { code: "ESERVFAIL" }));
    await expect(inspectDns("example.com", async () => {})).rejects.toThrow("DNS could not be reached");
  });

  it("flags old editable records, not the A resolution behind a CNAME or a valid root alias", () => {
    const recommended = [
      { type: "A" as const, name: "example.com", value: "192.0.2.1" },
      { type: "CNAME" as const, name: "www.example.com", value: "target.example.net" },
    ];
    const old = { type: "A" as const, name: "example.com", value: "23.1.2.3" };
    const alias = { type: "CNAME" as const, name: "www.example.com", value: "old.wixdns.net" };
    const inspection = { domain: "example.com", providerId: "other", nameservers: [],
      records: [old, alias, { ...old, name: "www.example.com" }] };
    expect(conflictingRecords(inspection, recommended)).toEqual([old, alias]);
    expect(conflictingRecords({ ...inspection, records: [
      recommended[0], { ...alias, value: "example.com" },
    ] }, recommended)).toEqual([]);
    expect(conflictingRecords({ ...inspection, records: [old] }, [
      ...recommended, { ...recommended[0], value: old.value },
    ])).toEqual([]);
  });
});
