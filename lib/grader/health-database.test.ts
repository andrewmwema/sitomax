import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc }));
import { graderDatabaseChecks } from "./health-database";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("confirms a matching destination and readable worker and Phase B tables", async () => {
  vi.stubEnv("GRADER_LEADS_ACCOUNT_ID", "37cbb241-381b-4bb5-b85d-0bef401d0bd9");
  vi.stubEnv("GRADER_LEADS_SITE_ID", "c69087f8-4538-4d40-8905-51f36403ec48");
  mocks.rpc.mockResolvedValue(null);
  const fetcher: typeof fetch = async (input) => Response.json(
    new URL(String(input)).pathname.endsWith("/sites") ? { id: "c69087f8-4538-4d40-8905-51f36403ec48" } : [],
  );
  const client = createClient("https://example.test", "test-key", { global: { fetch: fetcher } });
  const checks = await graderDatabaseChecks(client);
  expect(checks.every((check) => check.ok)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith("grader_get_cache", expect.objectContaining({ p_id: "00000000-0000-4000-8000-000000000000" }));
});

it("reports destination, worker and Phase B database failures separately", async () => {
  vi.stubEnv("GRADER_LEADS_ACCOUNT_ID", "37cbb241-381b-4bb5-b85d-0bef401d0bd9");
  vi.stubEnv("GRADER_LEADS_SITE_ID", "c69087f8-4538-4d40-8905-51f36403ec48");
  mocks.rpc.mockRejectedValue(new Error("worker failure"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/sites")) return Response.json(null);
    if (url.pathname.endsWith("/grader_followups")) return Response.json({ code: "42P01", message: "missing" }, { status: 404 });
    return Response.json([]);
  };
  const client = createClient("https://example.test", "test-key", { global: { fetch: fetcher } });
  const checks = await graderDatabaseChecks(client);
  expect(checks.map(({ name, ok }) => ({ name, ok }))).toEqual([
    { name: "Lead destination", ok: false },
    { name: "Grader worker and database", ok: false },
    { name: "Phase B database tables", ok: false },
  ]);
});
