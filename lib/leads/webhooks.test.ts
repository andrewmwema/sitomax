import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/public-https", () => ({ requestPublicHttps: request }));
import { postLeadWebhook } from "./webhooks";

it("signs exactly the UTF-8 bytes sent to the catcher, preserves its response code and discards the response body", async () => {
  const destroy = vi.fn();
  request.mockResolvedValue({ statusCode: 307, destroy });
  const payload = { data: { name: "Renée" }, type: "lead.created" };
  expect(await postLeadWebhook("https://catch.example.test", "test-signing-key", "evt", payload)).toBe(307);
  const body = JSON.stringify(payload);
  expect(request).toHaveBeenCalledExactlyOnceWith(new URL("https://catch.example.test"), expect.any(AbortSignal), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-SitoMax-Event-Id": "evt",
      "X-SitoMax-Signature": createHmac("sha256", "test-signing-key").update(Buffer.from(body)).digest("hex"),
    },
  }, body);
  expect(destroy).toHaveBeenCalledOnce();
});
