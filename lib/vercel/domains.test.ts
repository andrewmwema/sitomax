import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customDomainSchema } from "@/lib/domains";
import {
  addDomain, DomainApiError, getDomain, getDomainConfig,
  getDomainConnection, removeDomain, verifyDomain,
} from "./domains";

const fetchMock = vi.fn<typeof fetch>();
const projectDomain = (name = "example.com") => ({
  name, verified: true, redirect: name.startsWith("www.") ? "example.com" : null,
  redirectStatusCode: name.startsWith("www.") ? 308 : null,
});
const config = {
  misconfigured: false,
  recommendedIPv4: [{ rank: 2, value: ["192.0.2.2"] }, { rank: 1, value: ["192.0.2.1", "192.0.2.3"] }],
  recommendedCNAME: [{ rank: 2, value: "other.example.net" }, { rank: 1, value: "preferred.example.net" }],
};
const json = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
  vi.stubEnv("VERCEL_API_TOKEN", "test-token");
  vi.stubEnv("VERCEL_PROJECT_ID", "project/id");
  vi.stubEnv("VERCEL_TEAM_ID", "team 1");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/domains") && init?.method === "POST") {
      return json(projectDomain(JSON.parse(String(init.body)).name));
    }
    if (url.pathname.endsWith("/config")) return json(config);
    return json(projectDomain(url.pathname.includes("www.") ? "www.example.com" : "example.com"));
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("domain normalization", () => {
  it("normalizes pasted URLs and www aliases without accepting paths, credentials, IPs or invalid labels", () => {
    expect(customDomainSchema.parse(" HTTPS://WWW.Example.COM/ ")).toBe("example.com");
    for (const input of ["example.com/page", "user@example.com", "example.com:443", "127.0.0.1",
      "localhost", "-bad.example.com", "example..com", "example.com?next=1", "//example.com"]) {
      expect(customDomainSchema.safeParse(input).success, input).toBe(false);
    }
  });
});

describe("domain API", () => {
  it("uses the requested versions, server credentials, team scope and an uncached request", async () => {
    await addDomain("example.com");
    await addDomain("www.example.com", "example.com");
    await getDomain("example.com");
    await getDomainConfig("example.com");
    await verifyDomain("example.com");
    await removeDomain("example.com");
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ["https://api.vercel.com/v10/projects/project%2Fid/domains?teamId=team+1", "POST"],
      ["https://api.vercel.com/v10/projects/project%2Fid/domains?teamId=team+1", "POST"],
      ["https://api.vercel.com/v9/projects/project%2Fid/domains/example.com?teamId=team+1", "GET"],
      ["https://api.vercel.com/v6/domains/example.com/config?teamId=team+1", "GET"],
      ["https://api.vercel.com/v9/projects/project%2Fid/domains/example.com/verify?teamId=team+1", "POST"],
      ["https://api.vercel.com/v9/projects/project%2Fid/domains/example.com?teamId=team+1", "DELETE"],
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer test-token" }, cache: "no-store", body: '{"name":"example.com"}',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      name: "www.example.com", redirect: "example.com", redirectStatusCode: 308,
    });
    vi.stubEnv("VERCEL_TEAM_ID", "");
    await getDomain("example.com");
    expect(String(fetchMock.mock.lastCall?.[0])).not.toContain("?");
  });

  it("fails closed on missing credentials, API failures and invalid successful responses", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    await expect(getDomain("example.com")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_API_TOKEN", "test-token");
    fetchMock.mockResolvedValueOnce(json({ error: { code: "forbidden", message: "private vendor detail" } }, 403));
    const error = await getDomain("example.com").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DomainApiError);
    expect(String(error)).not.toContain("private vendor detail");
    fetchMock.mockResolvedValueOnce(json({ verified: "true" }));
    await expect(getDomain("example.com")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("retries already-attached domains only if their production target matches", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "domain_already_in_use" } }, 400));
    await expect(addDomain("example.com")).resolves.toMatchObject(projectDomain());
    fetchMock.mockResolvedValueOnce(json({ error: { code: "domain_already_in_use" } }, 400))
      .mockResolvedValueOnce(json({ ...projectDomain("www.example.com"), redirect: "someone-else.com" }));
    await expect(addDomain("www.example.com", "example.com")).rejects.toMatchObject({ code: "conflicting_connection" });
    fetchMock.mockResolvedValueOnce(json({ error: { code: "domain_taken" } }, 409));
    fetchMock.mockResolvedValueOnce(json({ error: { code: "not_found" } }, 404));
    await expect(addDomain("example.com")).rejects.toMatchObject({ status: 409, code: "domain_in_use_elsewhere" });
  });

  it("makes partial removal retryable but does not swallow permission errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "not_found" } }, 404));
    await expect(removeDomain("example.com")).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(json({ error: { code: "forbidden" } }, 403));
    await expect(removeDomain("example.com")).rejects.toMatchObject({ status: 403 });
  });
});

describe("DNS instructions and connection status", () => {
  it("uses preferred API records, not fixed targets, and requires both hostnames to be ready", async () => {
    const result = await getDomainConnection("example.com", { verify: true, repair: true });
    expect(result).toMatchObject({ status: "Connected", issue: "", records: [
      { type: "A", name: "example.com", value: "192.0.2.1" },
      { type: "A", name: "example.com", value: "192.0.2.3" },
      { type: "CNAME", name: "www.example.com", value: "preferred.example.net" },
    ] });
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(result.acceptableRecords).toContainEqual({ type: "A", name: "example.com", value: "192.0.2.2" });
  });

  it("keeps TXT challenges visible after a pending verification and deduplicates them", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/verify")) return json({ error: { code: "no_txt_record" } }, 400);
      if (path.endsWith("/config")) return json({ ...config, misconfigured: true });
      return json({ ...projectDomain(path.includes("www.") ? "www.example.com" : "example.com"), verified: false,
        verification: [{ type: "TXT", domain: "_verify.example.com", value: "ownership-token" }] });
    });
    const result = await getDomainConnection("example.com", { verify: true, repair: true });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/verify?teamId=team+1"))).toHaveLength(2);
    expect(result.status).toBe("Pending");
    expect(result.records.filter((record) => record.type === "TXT")).toEqual([
      { type: "TXT", name: "_verify.example.com", value: "ownership-token" },
    ]);
  });

  it.each([
    { missing: ["example.com"] },
    { missing: ["www.example.com"] },
    { missing: ["example.com", "www.example.com"] },
  ])(
    "reattaches missing hostnames before refreshing recommendations ($missing)",
    async ({ missing }) => {
      const attached = new Set(["example.com", "www.example.com"].filter((name) => !missing.includes(name)));
      const missingResponse = () => json({ error: { code: "not_found" } }, 404);
      fetchMock.mockImplementation(async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/config")) return attached.has(path.split("/").at(-2)!) ? json(config) : missingResponse();
        if (path.endsWith("/domains") && init?.method === "POST") {
          const { name, redirect, redirectStatusCode } = JSON.parse(String(init.body));
          attached.add(name);
          return json({ name, verified: true, redirect, redirectStatusCode });
        }
        const name = path.split("/").at(-1)!;
        return attached.has(name) ? json(projectDomain(name)) : missingResponse();
      });
      expect((await getDomainConnection("example.com")).status).toBe("Needs attention");
      expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
      expect(await getDomainConnection("example.com", { verify: true, repair: true })).toMatchObject({
        status: "Connected",
        records: expect.arrayContaining([
          { type: "A", name: "example.com", value: "192.0.2.1" },
          { type: "CNAME", name: "www.example.com", value: "preferred.example.net" },
        ]),
      });
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body))))
        .toEqual(missing.map((name) => name.startsWith("www.")
          ? { name, redirect: "example.com", redirectStatusCode: 308 } : { name }));
    },
  );

  it.each([true, false])("explains external conflicts and only shows TXT values returned by Vercel (challenge: %s)", async (hasChallenge) => {
    const verification = { type: "TXT", domain: "_vercel.example.com", value: "ownership-token" };
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/domains") && init?.method === "POST") {
        return json({ error: { code: "domain_already_in_use", ...(hasChallenge ? { verification: [verification] } : {}) } }, 409);
      }
      if (path.endsWith("/config")) return json(config);
      if (path.endsWith("/www.example.com")) return json(projectDomain("www.example.com"));
      return json({ error: { code: "not_found" } }, 404);
    });
    const result = await getDomainConnection("example.com", { verify: true, repair: true });
    expect(result.status).toBe("Needs attention");
    expect(result.issue).toContain("This domain is in use elsewhere.");
    expect(result.issue).toContain(hasChallenge ? "Add the exact TXT name and value" : "Ask the current project owner to release it");
    expect(result.records.filter(({ type }) => type === "TXT")).toEqual(hasChallenge
      ? [{ type: "TXT", name: verification.domain, value: verification.value }] : []);
  });

  it("does not attempt to add a domain when the project lookup is forbidden", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "forbidden" } }, 403));
    await expect(getDomainConnection("example.com", { verify: true, repair: true })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("flags bad www DNS and refuses to show Connected if recommendations are missing", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/config")) return json({ ...config, misconfigured: path.includes("www.") });
      return json(projectDomain(path.includes("www.") ? "www.example.com" : "example.com"));
    });
    expect((await getDomainConnection("example.com")).status).toBe("Needs attention");
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/config")) return json({ ...config, recommendedIPv4: [] });
      return json(projectDomain(path.includes("www.") ? "www.example.com" : "example.com"));
    });
    expect((await getDomainConnection("example.com")).status).toBe("Needs attention");
  });
});
