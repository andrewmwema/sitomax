import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { isPublicIpv4 } from "@/lib/public-https";

const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [prefix, bits] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) blockedV6.addSubnet(prefix, bits, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return publicV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
  return false;
}

export function normalizeGraderUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new Error("Enter a valid website URL.");
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!["http:", "https:"].includes(url.protocol) || url.port || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS URL without credentials or a non-standard port.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) ? !isPublicAddress(host) : !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]*$/i.test(host)) {
    throw new Error("Use a public website address.");
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url;
}

async function resolvePublicHost(url: URL, signal: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  if (family) {
    if (!isPublicAddress(hostname)) throw new Error("The address is not public.");
    return { address: hostname, family };
  }
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The host does not resolve exclusively to public addresses.");
  }
  return addresses[0];
}

async function open(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  const target = await resolvePublicHost(url, signal);
  signal.throwIfAborted();
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false, signal, family: target.family,
      headers: { "User-Agent": "SitoMax Website Grader/1.0", "Accept-Encoding": "identity" },
      lookup: (_host, _options, callback) => callback(null, target.address, target.family),
    }, resolve);
    req.once("error", reject);
    req.end();
  });
}

export async function fetchGraderUrl(input: string, limit = 3 * 1024 * 1024) {
  let url = normalizeGraderUrl(input);
  const redirects: string[] = [];
  for (let hop = 0; hop <= 5; hop++) {
    const signal = AbortSignal.timeout(10_000);
    const response = await open(url, signal);
    try {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        if (hop === 5) throw new Error("Too many redirects.");
        const next = normalizeGraderUrl(new URL(response.headers.location, url).href);
        redirects.push(next.href);
        url = next;
        continue;
      }
      if (status === 403 || status === 429) {
        return { status, url: url.href, redirects, headers: response.headers, body: Buffer.alloc(0) };
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        throw new Error("Unsupported content encoding.");
      }
      if (Number(response.headers["content-length"]) > limit) throw new Error("Response is too large.");
      let total = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of response) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > limit) throw new Error("Response is too large.");
        chunks.push(bytes);
      }
      return { status, url: url.href, redirects, headers: response.headers, body: Buffer.concat(chunks) };
    } finally {
      response.destroy();
    }
  }
  throw new Error("Too many redirects.");
}
