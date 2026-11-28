import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/grader/retention", () => ({ processGraderRetention: mocks.run }));
import { GET } from "./route";

const call = (authorization?: string) => GET(new Request("https://app.sitomax.com/api/cron/grader-retention",
  { headers: authorization ? { authorization } : {} }));

beforeEach(() => { vi.stubEnv("CRON_SECRET", "cron-secret"); mocks.run.mockReset().mockResolvedValue({ retentionDays: 90, deleted: 2, failures: 0 }); });
afterEach(() => vi.unstubAllEnvs());

describe("grader retention cron", () => {
  it("requires the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs retention and reports failures", async () => {
    const response = await call("Bearer cron-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ retentionDays: 90, deleted: 2, failures: 0 });
    mocks.run.mockResolvedValue({ retentionDays: 90, deleted: 0, failures: 1 });
    expect((await call("Bearer cron-secret")).status).toBe(500);
  });
});
