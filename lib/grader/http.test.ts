import { afterEach, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./http";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("accepts only successful Turnstile tokens for an allowed host", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hostname: "sitomax.com" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hostname: "attacker.example" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, hostname: "sitomax.com" })));
  vi.stubGlobal("fetch", fetch);
  expect(await verifyTurnstile("token", "8.8.8.8")).toBe(true);
  expect(await verifyTurnstile("token", "8.8.8.8")).toBe(false);
  expect(await verifyTurnstile("token", "8.8.8.8")).toBe(false);
});

it("accepts Cloudflare's fixed test hostname only in development with its test secret", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify({ success: true, hostname: "example.com" }))));
  expect(await verifyTurnstile("dummy", "8.8.8.8")).toBe(true);
  vi.stubEnv("NODE_ENV", "production");
  expect(await verifyTurnstile("dummy", "8.8.8.8")).toBe(false);
});
