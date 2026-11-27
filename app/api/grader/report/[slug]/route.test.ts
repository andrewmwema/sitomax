import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/grader/worker", () => ({ graderRpc: mocks.rpc }));
import { GET } from "./route";

const report = {
  slug: "example-0123456789abcdef", url: "https://example.com/", domain: "example.com",
  status: "complete", progress: {}, scores: null, screenshot_url: null, unlocked: false,
  headline: null, top_issues: null,
};
const request = () => new Request("https://app.sitomax.com/api/grader/report/example-0123456789abcdef");
const params = { params: Promise.resolve({ slug: report.slug }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue(report);
});

describe("public grader report", () => {
  it("returns the locked teaser without private fields", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
  });
  it("fails closed if a locked response contains full results", async () => {
    mocks.rpc.mockResolvedValue({ ...report, results: { checks: [], places_enabled: false } });
    const response = await GET(request(), params);
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("results");
  });
  it("preserves not-found responses", async () => {
    mocks.rpc.mockResolvedValue(null);
    expect((await GET(request(), params)).status).toBe(404);
  });
});
