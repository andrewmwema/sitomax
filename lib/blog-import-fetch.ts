import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(prefix, bits);

export async function fetchBlogImport(raw: string, limit: number, signal: AbortSignal) {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    signal.throwIfAborted();
    if (url.protocol !== "https:" || url.port || url.username || url.password || isIP(url.hostname) ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]*$/i.test(url.hostname)) {
      throw new Error("Use a public HTTPS URL.");
    }
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    if (!addresses.length || addresses.some(({ address }) => blocked.check(address))) throw new Error("Use a public HTTPS host.");
    const address = addresses[0].address;
    // Pin the validated address but retain hostname-based TLS verification.
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      const req = request(url, { agent: false, signal, family: 4,
        lookup: (_host, _options, callback) => callback(null, address, 4),
        headers: { "Accept-Encoding": "identity" },
      }, resolve);
      req.on("error", reject);
      req.end();
    });
    try {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        url = new URL(response.headers.location, url);
        continue;
      }
      if (status !== 200 || ![undefined, "identity"].includes(response.headers["content-encoding"])) {
        throw new Error("Could not download the source.");
      }
      if (Number(response.headers["content-length"]) > limit) throw new Error("Download exceeds the size limit.");
      let total = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of response) {
        total += chunk.length;
        if (total > limit) throw new Error("Download exceeds the size limit.");
        chunks.push(chunk);
      }
      return { bytes: Buffer.concat(chunks), url: url.href };
    } finally { response.destroy(); }
  }
  throw new Error("Too many redirects.");
}

export function importImageType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: "png", mime: "image/png" };
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { ext: "jpg", mime: "image/jpeg" };
  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return { ext: "gif", mime: "image/gif" };
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}
