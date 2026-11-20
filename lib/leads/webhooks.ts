import "server-only";

import { createHmac } from "node:crypto";
import { requestPublicHttps } from "@/lib/public-https";

export function signLeadWebhook(secret: string, body: string) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export async function postLeadWebhook(url: string, secret: string, eventId: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const response = await requestPublicHttps(new URL(url), AbortSignal.timeout(8000), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-SitoMax-Signature": signLeadWebhook(secret, body),
      "X-SitoMax-Event-Id": eventId,
    },
  }, body);
  // Don't follow redirects or read untrusted response bodies.
  response.destroy();
  return response.statusCode ?? null;
}
