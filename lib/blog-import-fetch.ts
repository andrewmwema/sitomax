import { requestPublicHttps } from "@/lib/public-https";

export async function fetchBlogImport(raw: string, limit: number, signal: AbortSignal) {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await requestPublicHttps(url, signal, { headers: { "Accept-Encoding": "identity" } });
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
