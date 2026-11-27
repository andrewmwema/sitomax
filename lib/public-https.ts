import { lookup } from "node:dns/promises";
import { request, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(prefix, bits);

export function isPublicIpv4(address: string) {
  return isIP(address) === 4 && !blocked.check(address);
}

export function isPublicHttpsUrl(url: URL) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password && !isIP(url.hostname)
    && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]*$/i.test(url.hostname);
}

export async function requestPublicHttps(url: URL, signal: AbortSignal,
  options: Pick<RequestOptions, "method" | "headers">, body?: string) {
  signal.throwIfAborted();
  if (!isPublicHttpsUrl(url)) throw new Error("Use a public HTTPS URL.");
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpv4(address))) throw new Error("Use a public HTTPS host.");
  const address = addresses[0].address;
  // Pin the validated address but retain hostname-based TLS verification.
  return new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    const req = request(url, { ...options, agent: false, signal, family: 4,
      lookup: (_host, _options, callback) => callback(null, address, 4),
    }, resolve);
    req.on("error", reject);
    req.end(body);
  });
}
