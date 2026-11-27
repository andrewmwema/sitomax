import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchGraderUrl, isPublicAddress, normalizeGraderUrl } from "./fetch";

function reply(status: number, headers: Record<string, string>, body = "") {
  mocks.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = Readable.from([Buffer.from(body)]) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = status;
      response.headers = headers;
      callback(response);
    };
    return request;
  });
}

beforeEach(() => {
  mocks.lookup.mockReset();
  mocks.request.mockReset();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});

describe("grader safe fetching", () => {
  it("normalizes the URL and removes tracking but preserves meaningful parameters", () => {
    expect(normalizeGraderUrl(" EXAMPLE.COM/path?utm_source=x&product=2&gclid=y#part ").href)
      .toBe("https://example.com/path?product=2");
  });

  it.each([
    "http://localhost", "http://127.1", "http://169.254.169.254", "http://[::1]",
    "http://[::ffff:127.0.0.1]", "http://10.1.1.1", "http://example.com:8080",
    "https://user:pass@example.com", "file:///etc/passwd", "ftp://example.com/",
  ])("rejects unsafe input %s", (url) => {
    expect(() => normalizeGraderUrl(url)).toThrow();
  });

  it.each(["192.168.1.2", "172.16.0.1", "100.64.0.1", "169.254.169.254",
    "::1", "fc00::1", "fe80::1", "::ffff:8.8.8.8", "2001:db8::1"])(
    "rejects non-public resolved address %s", (address) => expect(isPublicAddress(address)).toBe(false),
  );

  it("rejects DNS answers containing even one private address before connecting", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(fetchGraderUrl("https://example.com")).rejects.toThrow("public");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("pins the verified DNS address for the actual connection", async () => {
    reply(200, {}, "OK");
    await fetchGraderUrl("https://example.com");
    const options = mocks.request.mock.calls[0][1];
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("validates every redirect before connecting", async () => {
    reply(302, { location: "http://169.254.169.254/latest/meta-data" });
    await expect(fetchGraderUrl("https://example.com")).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("resolves redirect hosts again and rejects DNS rebinding to a private address", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    reply(302, { location: "https://example.com/next" });
    await expect(fetchGraderUrl("https://example.com")).rejects.toThrow("public");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("enforces the redirect and response size limits", async () => {
    for (let i = 0; i < 6; i++) reply(302, { location: "/next" });
    await expect(fetchGraderUrl("https://example.com")).rejects.toThrow("redirects");
    reply(200, {}, "12345");
    await expect(fetchGraderUrl("https://example.com", 4)).rejects.toThrow("large");
  });

  it("reports blocks without attempting to download their bodies", async () => {
    reply(403, { "content-length": "99999999" }, "Blocked");
    const response = await fetchGraderUrl("https://example.com", 4);
    expect(response.status).toBe(403);
    expect(response.body.length).toBe(0);
  });
});
